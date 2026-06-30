import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planExpression } from "../dist/backend/planner/expressions.js";
import {
  tryPlanCompatRuntimePropertyGet,
} from "../dist/backend/planner/compat-runtime-operations.js";
import {
  KindBinaryExpression,
  KindCallExpression,
  KindEqualsToken,
  KindElementAccessExpression,
  KindIdentifier,
  KindNewExpression,
  KindNumericLiteral,
  KindPropertyAccessExpression,
} from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import {
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpSourceOwnedSelectedSignatureFact,
} from "../dist/source/csharp-source-semantics/source-owned-selected-signature.js";

test("compat any property get renders only from finalized closed carrier operation facts", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const diagnostics = [];
  const expression = planExpression(propertyAccess, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[propertyAccess, compatRuntimeOperation("ReadCompatSlot", [
      { kind: "literal", value: "TargetSlot" },
    ])]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), 'value.ReadCompatSlot("TargetSlot")');
});

test("compat any property get fails closed without finalized operation facts", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const diagnostics = [];
  const expression = planExpression(propertyAccess, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /compat-runtime any property get requires a finalized closed compat-runtime operation fact/u);
});

test("compat any property get rejects facts with only a closed result carrier", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const diagnostics = [];
  const expression = planExpression(propertyAccess, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[propertyAccess, {
      ...compatRuntimeOperation("ReadCompatSlot", [
        { kind: "literal", value: "TargetSlot" },
      ]),
      declaringType: undefined,
      resultType: tsValueCarrier(),
    }]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a closed TsValue\/TsObject\/TsArray\/TsFunction carrier/u);
});

test("compat any property set renders closed carrier setter operations from explicit projection", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const assignment = binary(propertyAccess, numeric("1"));
  const diagnostics = [];
  const expression = planExpression(assignment, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[assignment, compatRuntimeOperation("WriteCompatSlot", [
      { kind: "literal", value: "TargetSlot" },
      { kind: "source-argument", index: 0 },
    ])]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), 'value.WriteCompatSlot("TargetSlot", 1)');
});

test("compat any property set rejects property assignment facts without explicit projection", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const assignment = binary(propertyAccess, numeric("1"));
  const diagnostics = [];
  const operation = {
    ...compatRuntimeOperation("WritableCompatSlot", undefined),
    operationKind: "property",
    argumentProjection: undefined,
  };
  const expression = planExpression(assignment, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[assignment, operation]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /property set requires a finalized method operation fact with explicit argument projection/u);
});

test("compat any element get renders closed carrier getter operations from explicit key projection", () => {
  const receiver = identifier("value");
  const key = identifier("key");
  const elementAccess = element(receiver, key);
  const diagnostics = [];
  const expression = planExpression(elementAccess, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[elementAccess, compatRuntimeOperation("ReadCompatElement", [
      { kind: "source-argument", index: 0 },
    ])]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "value.ReadCompatElement(key)");
});

test("compat any element set renders closed carrier setter operations from explicit key and value projection", () => {
  const receiver = identifier("value");
  const key = identifier("key");
  const elementAccess = element(receiver, key);
  const assignment = binary(elementAccess, numeric("1"));
  const diagnostics = [];
  const expression = planExpression(assignment, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[assignment, compatRuntimeOperation("WriteCompatElement", [
      { kind: "source-argument", index: 0 },
      { kind: "source-argument", index: 1 },
    ])]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(expression), "value.WriteCompatElement(key, 1)");
});

test("compat any element get fails closed when key projection is missing", () => {
  const receiver = identifier("value");
  const key = identifier("key");
  const elementAccess = element(receiver, key);
  const diagnostics = [];
  const expression = planExpression(elementAccess, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[elementAccess, compatRuntimeOperation("ReadCompatElement", [
      { kind: "source-argument", index: 1 },
    ])]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires source argument index 1/u);
});

test("compat any property set fails closed when projection is missing", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const assignment = binary(propertyAccess, numeric("1"));
  const diagnostics = [];
  const expression = planExpression(assignment, {}, fakeInput({
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[assignment, {
      ...compatRuntimeOperation("WriteCompatSlot", []),
      argumentProjection: undefined,
    }]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires an explicit finalized argument projection/u);
});

test("compat any call and construct render closed carrier operations from explicit projections", () => {
  const callable = identifier("callable");
  const constructor = identifier("constructorValue");
  const call = callExpression(callable, [numeric("1")]);
  const construct = newExpression(constructor, [numeric("2")]);
  const input = fakeInput({
    runtimeCarriers: new Map([
      [callable, anyCarrierFact()],
      [constructor, anyCarrierFact()],
    ]),
    operations: new Map([
      [call, compatRuntimeOperation("InvokeCompat", [{ kind: "source-argument", index: 0 }])],
      [construct, compatRuntimeOperation("ConstructCompat", [{ kind: "source-argument", index: 0 }])],
    ]),
  });
  const callDiagnostics = [];
  const constructDiagnostics = [];

  const callOutput = planExpression(call, {}, input, callDiagnostics);
  const constructOutput = planExpression(construct, {}, input, constructDiagnostics);

  assert.deepEqual(callDiagnostics, []);
  assert.deepEqual(constructDiagnostics, []);
  assert.equal(printCsharpExpression(callOutput), "callable.InvokeCompat(1)");
  assert.equal(printCsharpExpression(constructOutput), "constructorValue.ConstructCompat(2)");
});

test("source-owned selected call facts bypass provider-call ownership gates", () => {
  const handler = identifier("handler");
  const call = callExpression(handler, []);
  const diagnostics = [];
  const output = planExpression(call, {}, fakeInput({
    runtimeCarriers: new Map([[handler, {
      carrier: {
        kind: "target-named",
        id: "System.Action",
        csharpDelegateSignature: {
          parameters: [],
          returnType: { kind: "target-named", id: "System.Void" },
        },
      },
    }]]),
    selectedCalls: new Map([[call, csharpSourceOwnedSelectedSignatureFact({})]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "handler()");
});

test("source-owned selected member calls render invocation callees without property-read facts", () => {
  const receiver = identifier("calculator");
  const member = property(receiver, "add");
  const call = callExpression(member, []);
  const diagnostics = [];
  const output = planExpression(call, {}, fakeInput({
    selectedCalls: new Map([[call, csharpSourceOwnedSelectedSignatureFact({})]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "calculator.add()");
});

test("compat carrier facts are rejected in strict-native target mode", () => {
  const receiver = identifier("value");
  const propertyAccess = property(receiver, "name");
  const diagnostics = [];
  const expression = planExpression(propertyAccess, {}, fakeInput({
    target: { id: "csharp", options: { typescriptCompatibility: "strict-native" } },
    runtimeCarriers: new Map([[receiver, anyCarrierFact()]]),
    operations: new Map([[propertyAccess, compatRuntimeOperation("ReadCompatSlot", [
      { kind: "literal", value: "TargetSlot" },
    ])]]),
  }), diagnostics);

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /only valid when the C# target selects typescriptCompatibility: "compat"/u);
});

test("compat any operations do not apply to unknown or object carriers", () => {
  for (const [description, runtimeCarrier] of [
    ["unknown", { carrier: { kind: "opaque", id: "unknown" } }],
    ["object", { carrier: { kind: "target-named", id: "System.Object" } }],
  ]) {
    const receiver = identifier(description);
    const propertyAccess = property(receiver, "name");
    const diagnostics = [];
    const expression = tryPlanCompatRuntimePropertyGet(propertyAccess, receiver, false, {}, fakeInput({
      runtimeCarriers: new Map([[receiver, runtimeCarrier]]),
      operations: new Map([[propertyAccess, compatRuntimeOperation("ReadCompatSlot", [
        { kind: "literal", value: "TargetSlot" },
      ])]]),
    }), diagnostics, () => {
      throw new Error("compat planner must not request expression planning for non-any carriers");
    });

    assert.equal(expression, undefined, description);
    assert.deepEqual(diagnostics, [], description);
  }
});

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    target: options.target ?? { id: "csharp", options: { typescriptCompatibility: "compat" } },
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: (subject) => options.selectedCalls?.get(subject),
      getSelectedTargetOperator: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => options.runtimeCarriers?.get(subject),
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getFact: (subject, key) => key === csharpTargetOperationFactKey
        ? options.operations?.get(subject)
        : undefined,
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      describeTypeAtLocation: () => undefined,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => resolvedCarrierResolution(options.runtimeCarriers?.get(subject)?.carrier),
      resolveRuntimeCarrierForNode: (subject) => resolvedCarrierResolution(options.runtimeCarriers?.get(subject)?.carrier),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: () => false,
      isStringLike: () => false,
      isBooleanLike: () => false,
      isBigIntLike: () => false,
      isVoidLike: () => false,
      isUnion: () => false,
      isTuple: () => false,
      isArrayLike: () => false,
      isTypeReference: () => false,
      isNullish: () => false,
      getCallSignatures: () => [],
      getReturnTypeOfSignature: () => undefined,
      getUnionOrIntersectionTypes: () => [],
      getTupleElementTypes: () => [],
      getTypeArguments: () => [],
      getIndexInfos: () => [],
      getTypeReferenceTarget: (type) => type,
    },
  };
}

function compatRuntimeOperation(memberName, argumentProjection) {
  return {
    kind: "member",
    operationId: `test.compat.any.${memberName}`,
    operationKind: "method",
    memberName,
    declaringType: tsValueCarrier(),
    resultType: tsValueCarrier(),
    argumentProjection,
  };
}

function tsValueCarrier() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.TsValue",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "TsValue" },
  };
}

function anyCarrierFact() {
  return { carrier: { kind: "opaque", id: "any" } };
}

function identifier(name) {
  return { Kind: KindIdentifier, Text: name };
}

function property(receiver, name) {
  return {
    Kind: KindPropertyAccessExpression,
    Expression: receiver,
    name: identifier(name),
  };
}

function element(receiver, argument) {
  return {
    Kind: KindElementAccessExpression,
    Expression: receiver,
    ArgumentExpression: argument,
  };
}

function callExpression(expression, args) {
  return {
    Kind: KindCallExpression,
    Expression: expression,
    Arguments: { Nodes: args },
  };
}

function newExpression(expression, args) {
  return {
    Kind: KindNewExpression,
    Expression: expression,
    Arguments: { Nodes: args },
  };
}

function binary(left, right) {
  return {
    Kind: KindBinaryExpression,
    Left: left,
    Right: right,
    OperatorToken: { Kind: KindEqualsToken },
  };
}

function numeric(text) {
  return { Kind: KindNumericLiteral, Text: text };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => String(kind),
  typeArguments: () => [],
};
