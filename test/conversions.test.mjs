import { test } from "node:test";
import assert from "node:assert/strict";
import { planExpression } from "../dist/backend/planner/expressions.js";
import { KindTrueKeyword } from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";

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
        targetOperation: "System.Convert.ToByte",
      },
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

test("planner rejects unqualified target conversion methods without a provider rendering contract", () => {
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
  assert.match(diagnostics[0].message, /Target conversion method requires a declaring target type and method name/);
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
      getFact: () => undefined,
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
