import { test } from "node:test";
import assert from "node:assert/strict";
import { KindTrueKeyword } from "@tsonic/tsts";
import { planExpression } from "../dist/backend/planner/expressions.js";
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

test("planner diagnoses unsupported target conversion operations instead of guessing", () => {
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

  assert.equal(expression.kind, "invalid");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Target conversion operation 'operator' is not renderable/);
});

function trueKeyword() {
  return {
    Kind: KindTrueKeyword,
  };
}

function fakeInput(options = {}) {
  return {
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
