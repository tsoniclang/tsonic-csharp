import assert from "node:assert/strict";
import test from "node:test";
import { csharpNativeCallableMemberKey, getCsharpCallableMembers, getCsharpCallableValueSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";

const outer = Object.freeze({ kind: "type-parameter", identity: "carrier:Outer", name: "Outer",
  csharpConstraints: { kind: "resolved", constraints: [] } });

function member(identity, kind = "call") {
  const parameter = Object.freeze({ kind: "type-parameter", identity, name: identity });
  return Object.freeze({ name: kind === "call" ? "Invoke" : "Construct",
    typeParameters: Object.freeze([{ declaration: Object.freeze({}), identity, name: identity,
      constraints: [{ kind: "type", type: outer }] }]),
    signature: Object.freeze({ kind, receiver: { type: outer, passingMode: "byref-readonly" },
      parameters: Object.freeze([parameter]), parameterPassingModes: Object.freeze(["byref-readwrite"]), returnType: parameter }),
  });
}

function carrier(members) {
  return Object.freeze({ kind: "target-named", id: "test:CompleteCallable", typeArguments: [outer],
    csharpAllowsRefLikeTypeArguments: [false], csharpCallableMembers: Object.freeze(members) });
}

test("complete Native callable metadata does not hoist signature-local binders onto the carrier", () => {
  const value = carrier([member("method:Call"), member("method:Construct", "construct")]);
  assert.deepEqual([...csharpFreeTypeParameterIdentities([value])], [outer.identity]);
  assert.equal(getCsharpCallableMembers(value).length, 2, "both original capability methods remain physical");
  assert.equal(getCsharpCallableValueSignature(value) === undefined, true, "no first-signature selection");
});

test("a shared Native parameter node retains its free sibling use outside the method binder", () => {
  const selected = member("method:Shared");
  const shared = selected.signature.parameters[0];
  const value = { ...carrier([selected]), typeArguments: [shared] };
  const free = csharpFreeTypeParameterIdentities([value]);
  assert.equal(free.has(shared.identity), true, "the identical object has an independent free carrier argument occurrence");
  assert.equal(free.has(outer.identity), true, "the captured outer constraint and receiver remain free");
});

test("Native callable substitution changes free carrier constraints and receiver but not a method quantifier", () => {
  const original = member("method:Item");
  const integer = csharpSourcePrimitiveTargetType("int32");
  const value = substituteTargetTypeParameters(carrier([original]), new Map([[outer.identity, integer], ["method:Item", integer]]));
  const selected = getCsharpCallableMembers(value)[0];
  assert.equal(selected.signature.parameters[0].identity, "method:Item", "original local binder is not substituted");
  assert.equal(selected.signature.returnType.identity, "method:Item", "result retains the same local binder");
  assert.equal(selected.signature.receiver.type.name, "int32", "separate physical receiver is substituted");
  assert.equal(selected.signature.receiver.passingMode, "byref-readonly");
  assert.equal(selected.signature.parameterPassingModes[0], "byref-readwrite");
  assert.equal(selected.typeParameters[0].constraints[0].type.name, "int32", "free bound dependency is substituted");
});

test("Native callable contract identity is alpha-scoped and includes constraints, construct kind and receiver mode", () => {
  const first = member("method:First");
  const second = member("method:Second");
  assert.equal(csharpNativeCallableMemberKey(first), csharpNativeCallableMemberKey(second), "renaming only the bound identity changes no ABI");
  assert.notEqual(csharpNativeCallableMemberKey(first), csharpNativeCallableMemberKey({ ...second,
    typeParameters: [{ ...second.typeParameters[0], constraints: [] }] }), "constraint purpose remains part of the contract");
  assert.notEqual(csharpNativeCallableMemberKey(first), csharpNativeCallableMemberKey(member("method:Second", "construct")));
  assert.notEqual(csharpNativeCallableMemberKey(first), csharpNativeCallableMemberKey({ ...second,
    signature: { ...second.signature, receiver: { ...second.signature.receiver, passingMode: "by-value" } } }));
});

test("Native callable snapshots preserve original binder declarations and reject missing/duplicate binder inventories", () => {
  const original = member("method:Item");
  const value = carrier([original]);
  const snapshot = snapshotCsharpTargetTypes([value])[0];
  assert.equal(snapshot.csharpCallableMembers[0].typeParameters[0].declaration === original.typeParameters[0].declaration, true,
    "opaque original Node identity is not copied or traversed");
  assert.equal(isCsharpTargetTypeRef(carrier([{ name: "Invoke", signature: original.signature }])), false);
  assert.equal(isCsharpTargetTypeRef(carrier([{ ...original, typeParameters: [...original.typeParameters, ...original.typeParameters] }])), false);
});

test("generated Native method binders retain their full constraints without inventing a Source declaration", () => {
  const selected = member("method:Item");
  const { declaration: _declaration, ...generated } = selected.typeParameters[0];
  const value = carrier([{ ...selected, typeParameters: [generated] }]);
  const frozen = snapshotCsharpTargetTypes([value])[0].csharpCallableMembers[0].typeParameters[0];
  assert.equal(Object.hasOwn(frozen, "declaration"), false, "a genuine Native helper binder has no authored Node");
  assert.equal(frozen.identity, generated.identity);
  assert.equal(frozen.constraints[0].type.identity, outer.identity, "the full actual constraint dependency is retained");
  assert.equal(isCsharpTargetTypeRef(carrier([{ ...selected, typeParameters: [{ ...generated, declaration: undefined }] }])), false,
    "undefined is not a fake original declaration");
});
