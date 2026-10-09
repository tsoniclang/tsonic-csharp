import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { dotnetTypeRefToTargetTypeRef } from "../../../dist/providers/native/projection/type-ref.js";
import { csharpDelegateTargetType, csharpDelegateSignaturesMatchNativeBinding, isCsharpSourceDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";

const integer = { kind: "source-primitive", name: "int32" };
const widened = { kind: "source-primitive", name: "int64" };
const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} }, target: {} };
const passingModes = ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"];

function nativeDelegate(name, passingMode = "by-value", parameterType = integer, returnPassing) {
  return dotnetTypeRefToTargetTypeRef({
    kind: "named", targetId: `Fixture::${name}`, metadataName: `Fixture.${name}`,
    callableRepresentation: "delegate",
    renderShape: { kind: "named", namespace: ["Fixture"], name },
    sourceShape: { kind: "function", id: `Fixture::${name}.Invoke`,
      parameters: [{ name: "value", type: parameterType, passingMode }],
      returnType: integer, ...(returnPassing === undefined ? {} : { returnPassing }),
    },
  });
}

test("native delegate projection and generic substitution preserve every CLR passing mode", () => {
  for (const passingMode of passingModes) {
    const parameter = { kind: "type-parameter", identity: "Fixture.Generic:0", name: "T" };
    const original = nativeDelegate("Generic", passingMode, parameter);
    const closed = substituteTargetTypeParameters(original, new Map([[parameter.identity, integer]]));
    assert.equal(closed.csharpDelegateSignature.parameters[0].name, "int32");
    assert.equal(closed.csharpDelegateSignature.parameterPassingModes[0], passingMode);
    assert.equal(Object.isFrozen(original.csharpDelegateSignature.parameterPassingModes), true);
    assert.equal(closed.csharpDelegateSignature.parameterPassingModes === original.csharpDelegateSignature.parameterPassingModes, true);
  }
});

test("exact native delegate selection preserves distinct ref, out, in and value signatures", () => {
  for (const sourceMode of passingModes) {
    for (const targetMode of passingModes) {
      const source = nativeDelegate("Left", sourceMode);
      const target = nativeDelegate("Right", targetMode);
      const selected = selectCsharpConversion(policy, source, target, "implicit");
      assert.equal(selected.kind, sourceMode === targetMode ? "delegate-adapter" : "rejected", `${sourceMode} to ${targetMode}`);
      if (selected.kind === "delegate-adapter") assert.equal(selected.strategy, "native-binding");
    }
  }
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const selected = selectCsharpConversion(policy, source, nativeDelegate("Transform"), "implicit");
  assert.equal(selected.kind, "delegate-adapter");
  assert.equal(selected.strategy, "native-binding");
});

test("byref delegates reject carrier adaptation and return passing mutations", () => {
  for (const passingMode of passingModes.slice(1)) {
    assert.equal(selectCsharpConversion(policy, nativeDelegate("Left", passingMode, widened),
      nativeDelegate("Right", passingMode), "implicit").kind, "rejected");
  }
  for (const sourceMode of [undefined, "byref-readonly", "byref-readwrite"]) {
    for (const targetMode of [undefined, "byref-readonly", "byref-readwrite"]) {
      const source = nativeDelegate("ReturnLeft", "by-value", integer, sourceMode);
      const target = nativeDelegate("ReturnRight", "by-value", integer, targetMode);
      const selected = selectCsharpConversion(policy, source, target, "implicit");
      assert.equal(selected.kind, sourceMode === targetMode ? "delegate-adapter" : "rejected");
      if (selected.kind === "delegate-adapter") assert.equal(selected.strategy, "native-binding");
      assert.equal(source.csharpDelegateSignature.returnPassing, sourceMode);
    }
  }
});

test("mutated delegate modes fail closed and cannot masquerade as System.Func", () => {
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const target = nativeDelegate("Target");
  for (const modes of [undefined, [], new Array(1), ["by-value", "by-value"], ["move"], ["borrow-shared"], ["borrow-mut"], ["wrong"], ["byref-readwrite"]]) {
    const changed = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, parameterPassingModes: modes } };
    assert.equal(selectCsharpConversion(policy, changed, target, "implicit").kind, "rejected");
    assert.equal(isCsharpSourceDelegateTargetType(changed), false);
    assert.equal(csharpDelegateSignaturesMatchNativeBinding(changed.csharpDelegateSignature, target.csharpDelegateSignature), false);
  }
  const invalidReturn = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, returnPassing: "wrong" } };
  assert.equal(selectCsharpConversion(policy, invalidReturn, target, "implicit").kind, "rejected");
  for (const parameters of [new Array(1), [undefined]]) {
    const changed = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, parameters } };
    assert.equal(selectCsharpConversion(policy, changed, target, "implicit").kind, "rejected",
      "a sparse parameter vector cannot hide an unchecked native ABI slot");
    assert.equal(isCsharpSourceDelegateTargetType(changed), false);
    assert.equal(csharpDelegateSignaturesMatchNativeBinding(changed.csharpDelegateSignature, target.csharpDelegateSignature),
      false, "native binding requires every actual parameter");
  }
});

test("byref function shapes require their exact named delegate instead of Func or Action", () => {
  for (const passingMode of passingModes.slice(1)) {
    for (const returnType of [integer, { kind: "void" }]) {
      assert.throws(() => dotnetTypeRefToTargetTypeRef({ kind: "function", id: "Fixture.Invoke",
        parameters: [{ name: "value", type: integer, passingMode }], returnType }), /exact named CLR delegate carrier/u);
    }
  }
});
