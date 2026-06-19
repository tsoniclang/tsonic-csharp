import { test } from "node:test";
import assert from "node:assert/strict";
import { KindIdentifier } from "@tsonic/tsts";
import { getCallableSemanticOwnership, getProviderOperationOwnership, getSemanticOwnership } from "../dist/backend/planner/semantic-guards.js";

test("provider-owned operator operands require selected target operator facts", () => {
  const operand = node(KindIdentifier);
  const targetType = { flags: 0 };
  const input = fakeInput({
    typeAtLocation: targetType,
    targetBindingSubject: targetType,
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.deepEqual(ownership.reasons, ["operand type target binding"]);
});

test("plain source primitive operator operands are source-owned without backend type-flag inspection", () => {
  const operand = node(KindIdentifier);
  const primitiveType = {};
  const input = fakeInput({
    typeAtLocation: primitiveType,
    sourcePrimitiveSubject: primitiveType,
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, true);
  assert.deepEqual(ownership.reasons, []);
  assert.equal(ownership.sourcePrimitive.kind, "int32");
});

test("unowned non-scalar operator operands are not direct source operations", () => {
  const operand = node(KindIdentifier);
  const input = fakeInput({
    typeAtLocation: { flags: 0 },
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, []);
});

test("primitive member access still requires selected target member facts", () => {
  const receiver = node(KindIdentifier);
  const primitiveType = {};
  const input = fakeInput({
    typeAtLocation: primitiveType,
    sourcePrimitiveSubject: primitiveType,
  });

  const ownership = getSemanticOwnership(receiver, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["type source primitive"]);
});

test("type parameter operands are classified from finalized runtime carrier facts", () => {
  const operand = node(KindIdentifier);
  const typeParameter = {};
  const input = fakeInput({
    typeAtLocation: typeParameter,
    runtimeCarrierSubject: typeParameter,
    runtimeCarrier: { carrier: { kind: "type-parameter", name: "T" } },
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["operand type runtime carrier", "operand type parameter"]);
});

test("provider-owned constructor callees require selected target constructor facts", () => {
  const targetSymbol = { Name: "ProviderBox" };
  const callee = { Kind: KindIdentifier, Text: "ProviderBox" };
  const input = fakeInput({
    symbolAtLocation: targetSymbol,
    targetBindingSubject: targetSymbol,
  });

  const ownership = getCallableSemanticOwnership(callee, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.deepEqual(ownership.reasons, ["callee symbol target binding"]);
});

function node(kind) {
  return { Kind: kind };
}

function fakeInput(options = {}) {
  return {
    sourceFiles: [],
    checker: {
      getSymbolAtLocation: () => options.symbolAtLocation,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: () => options.typeAtLocation,
    },
    facts: {
      getSelectedTargetCall: () => options.selectedTargetCall,
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.TargetType" }
        : undefined,
      getFact: () => undefined,
      getRuntimeCarrierFact: (subject) => subject !== undefined && subject === options.runtimeCarrierSubject
        ? options.runtimeCarrier
        : undefined,
      getSourcePrimitiveFact: (subject) => subject !== undefined && subject === options.sourcePrimitiveSubject
        ? { kind: "int32", runtimeBase: "number", signed: true, width: 32 }
        : undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
    },
  };
}
