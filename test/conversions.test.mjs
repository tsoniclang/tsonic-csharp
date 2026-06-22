import { test } from "node:test";
import assert from "node:assert/strict";
import { planExpression } from "../dist/backend/planner/expressions.js";
import { KindTrueKeyword } from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import { csharpTargetConversionOperationFactKey, csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { csharpQualifiedTypeRenderShape, csharpTargetNamedType } from "../dist/source/csharp-source-semantics/target-types.js";

test("planner renders target conversion method facts as C# AST calls", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: { kind: "target-named", id: "System.Byte" },
      operation: {
        operationId: "System.Convert.ToByte",
        operationKind: "method",
        targetOperation: "ToByte",
      },
    },
    csharpOperationSubject: value,
    csharpOperation: {
      kind: "member",
      operationId: "System.Convert.ToByte",
      operationKind: "method",
      memberName: "ToByte",
      static: true,
      declaringType: csharpTargetNamedType("System.Convert", undefined, csharpQualifiedTypeRenderShape("System", "Convert")),
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "System.Convert.ToByte(true)");
});

test("planner leaves provider-proven identity conversions unwrapped", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: { kind: "target-named", id: "System.Int32" },
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "true");
});

test("planner does not rewrap selected target operations that already produce the converted type", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const byteType = { kind: "source-primitive", name: "uint8" };
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: byteType,
      operation: {
        operationId: "System.Convert.ToByte",
        operationKind: "method",
        targetOperation: "ToByte",
      },
    },
    selectedOperationSubject: value,
    selectedOperation: {
      kind: "member",
      operationId: "System.Convert.ToByte",
      operationKind: "method",
      memberName: "ToByte",
      static: true,
      resultType: byteType,
      declaringType: csharpTargetNamedType("System.Convert", undefined, csharpQualifiedTypeRenderShape("System", "Convert")),
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "true");
});

test("planner does not duplicate a selected target operation with the same conversion operation id", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      operation: {
        operationId: "System.Convert.ToByte",
        operationKind: "method",
        targetOperation: "ToByte",
      },
    },
    selectedOperationSubject: value,
    selectedOperation: {
      kind: "member",
      operationId: "System.Convert.ToByte",
      operationKind: "method",
      memberName: "ToByte",
      static: true,
      declaringType: csharpTargetNamedType("System.Convert", undefined, csharpQualifiedTypeRenderShape("System", "Convert")),
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "true");
});

test("planner still wraps selected target operations when the target conversion changes the result type", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const byteType = { kind: "source-primitive", name: "uint8" };
  const intType = { kind: "source-primitive", name: "int32" };
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: byteType,
      operation: {
        operationId: "System.Convert.ToByte",
        operationKind: "method",
        targetOperation: "ToByte",
      },
    },
    csharpOperationSubject: value,
    csharpOperation: {
      kind: "member",
      operationId: "System.Convert.ToByte",
      operationKind: "method",
      memberName: "ToByte",
      static: true,
      declaringType: csharpTargetNamedType("System.Convert", undefined, csharpQualifiedTypeRenderShape("System", "Convert")),
    },
    selectedOperationSubject: value,
    selectedOperation: {
      kind: "member",
      operationId: "Example.Int",
      operationKind: "method",
      memberName: "Int",
      static: true,
      resultType: intType,
      declaringType: csharpTargetNamedType("Example.Target", undefined, csharpQualifiedTypeRenderShape("Example", "Target")),
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "System.Convert.ToByte(true)");
});

test("planner diagnoses unsupported target conversion operations instead of inventing target semantics", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: { kind: "target-named", id: "System.Byte" },
      operation: {
        operationId: "System.Byte.op_Explicit",
        operationKind: "operator",
        targetOperation: "explicit",
      },
    },
  }), diagnostics);

  assert.equal(expression.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Target conversion operation 'operator' is not renderable/);
});

test("planner rejects conversion methods without a finalized C# operation fact", () => {
  const value = trueKeyword();
  const diagnostics = [];
  const expression = planExpression(value, {}, fakeInput({
    conversionSubject: value,
    conversion: {
      convertedType: { kind: "target-named", id: "System.Byte" },
      operation: {
        operationId: "ToByte",
        operationKind: "method",
        targetOperation: "ToByte",
      },
    },
  }), diagnostics);

  assert.equal(expression.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized C# target conversion operation fact/);
});

function trueKeyword() {
  return {
    Kind: KindTrueKeyword,
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: (subject) => subject === options.conversionSubject ? options.conversion : undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: () => undefined,
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getFact: (subject, key) => {
        if (subject === options.csharpOperationSubject && key === csharpTargetConversionOperationFactKey) {
          return options.csharpOperation;
        }
        if (subject === options.selectedOperationSubject && key === csharpTargetOperationFactKey) {
          return options.selectedOperation;
        }
        return undefined;
      },
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    semantics: {
      getTargetBindingForReference: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      describeTypeAtLocation: () => undefined,
    },
  };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
};
