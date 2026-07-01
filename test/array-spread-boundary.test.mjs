import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planArrayLiteralExpressionWithCarrier } from "../dist/backend/planner/array-literals/index.js";
import {
  KindArrayLiteralExpression,
  KindIdentifier,
  KindNumericLiteral,
  KindSpreadElement,
} from "../dist/backend/planner/source-ast.js";

test("array spread emits from finalized spread carrier facts", () => {
  const sourceExample = `
    declare const tail: number[];
    const value = [1, ...tail, 3];
  `;
  assert.match(sourceExample, /\.\.\.tail/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({ runtimeCarriers: new Map([[tail, int32ArrayType()]]) }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "InvocationExpression");
  assert.equal(planned.callee.name, "Concat");
  assert.deepEqual(planned.arguments.map((argument) => argument.expression), [
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 1 }],
    },
    { kind: "IdentifierName", name: "tail" },
    {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "int" },
      elements: [{ kind: "LiteralExpression", value: 3 }],
    },
  ]);
});

test("array spread missing facts fail closed before partial C# array creation", () => {
  const sourceExample = `
    declare const tail: unknown;
    const value = [1, ...tail, 3];
  `;
  assert.match(sourceExample, /unknown/);

  const tail = identifier("tail");
  const literal = arrayLiteral([
    numericLiteral("1"),
    spreadElement(tail),
    numericLiteral("3"),
  ]);
  const diagnostics = [];

  const planned = planArrayLiteralExpressionWithCarrier(
    literal,
    {},
    fakeInput({
      missingRuntimeCarrierReason: "spread operand carrier was not finalized",
      missingRuntimeCarrierEvidence: [{ message: "TSTS accepted spread syntax, but no target array carrier was recorded" }],
    }),
    diagnostics,
    int32ArrayType(),
    planner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /spread operand carrier was not finalized/);
  assert.deepEqual(diagnostics[0].evidence, ["TSTS accepted spread syntax, but no target array carrier was recorded"]);
});

function arrayLiteral(elements) {
  return {
    Kind: KindArrayLiteralExpression,
    Elements: { Nodes: elements },
  };
}

function spreadElement(expression) {
  return {
    Kind: KindSpreadElement,
    Expression: expression,
  };
}

function identifier(text) {
  return {
    Kind: KindIdentifier,
    Text: text,
  };
}

function numericLiteral(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

const planner = {
  planExpression: planFixtureExpression,
  planExpressionWithExpectedType: planFixtureExpression,
};

function planFixtureExpression(node) {
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "IdentifierName", name: node.Text };
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(node.Text) };
    default:
      throw new Error(`Unsupported array spread fixture node ${node.Kind}`);
  }
}

function int32ArrayType() {
  return {
    kind: "array",
    element: { kind: "source-primitive", name: "int32" },
  };
}

function fakeInput(options = {}) {
  const runtimeCarriers = options.runtimeCarriers ?? new Map();
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: () => undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = runtimeCarriers.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
      getSourcePrimitiveFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getStructFact: () => undefined,
      getFieldFact: () => undefined,
      getAttributeFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      isProjectSourceShapeForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
  };
}

function runtimeCarrierResolution(options, runtimeCarriers, subject) {
  const carrier = runtimeCarriers.get(subject);
  return carrier === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(carrier);
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
};
