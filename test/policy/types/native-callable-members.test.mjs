import assert from "node:assert/strict";
import test from "node:test";
import { csharpDelegateTargetType, csharpNativeCallableMemberKey, getCsharpCallableMembers, getCsharpCallableValueSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { csharpTypeEmissionKey } from "../../../dist/target-model/records/types/type-emission.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

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

test("Native emission identity retains every physical callable entry and its complete signature", () => {
  const first = member("method:First");
  const second = member("method:Second", "construct");
  const original = carrier([first, second]);
  const originalKey = csharpTypeEmissionKey(original);
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const [purpose, changed] of [
    ["member name", { ...second, name: "ConstructOther" }],
    ["capability kind", { ...second, signature: { ...second.signature, kind: "call" } }],
    ["receiver type", { ...second, signature: { ...second.signature, receiver: { type: integer, passingMode: "byref-readonly" } } }],
    ["receiver mode", { ...second, signature: { ...second.signature, receiver: { ...second.signature.receiver, passingMode: "by-value" } } }],
    ["parameter mode", { ...second, signature: { ...second.signature, parameterPassingModes: ["by-value"] } }],
    ["result type", { ...second, signature: { ...second.signature, returnType: integer } }],
    ["return mode", { ...second, signature: { ...second.signature, returnPassing: "byref-readonly" } }],
    ["optional parameter", { ...second, signature: { ...second.signature, optionalParameterIndexes: [0] } }],
    ["rest parameter", { ...second, signature: { ...second.signature, restParameterIndex: 0 } }],
    ["method constraints", { ...second, typeParameters: [{ ...second.typeParameters[0], constraints: [{ kind: "constructor" }] }] }],
  ]) {
    const selected = carrier([first, changed]);
    assert.equal(targetTypeRefEquals(original, selected), true, `${purpose}: the declared physical carrier is unchanged`);
    assert.notEqual(csharpTypeEmissionKey(selected), originalKey, `${purpose}: the second ABI cannot be replaced by the first publication`);
  }
  assert.notEqual(csharpTypeEmissionKey(carrier([second, first])), originalKey, "the complete physical method order remains explicit");
  assert.equal(csharpTypeEmissionKey(carrier([{ ...first }, { ...second }])), originalKey,
    "identical Native data has a stable key independent of object sharing");
  const shared = { name: "Invoke", typeParameters: [], signature: { kind: "call",
    parameters: [outer, outer], parameterPassingModes: ["by-value", "by-value"], returnType: outer } };
  const copied = { ...shared, signature: { ...shared.signature, parameters: [{ ...outer }, { ...outer }], returnType: { ...outer } } };
  assert.equal(csharpTypeEmissionKey(carrier([shared])), csharpTypeEmissionKey(carrier([copied])),
    "equal repeated Native components have one content identity whether shared or copied");
});

test("Native emission identity preserves actual method and carrier binder contexts beside alpha-equivalent contracts", () => {
  const first = member("method:First");
  const second = member("method:Second");
  assert.equal(csharpNativeCallableMemberKey(first), csharpNativeCallableMemberKey(second), "the physical method contracts remain alpha-equivalent");
  assert.notEqual(csharpTypeEmissionKey(carrier([first])), csharpTypeEmissionKey(carrier([second])),
    "emission uses the actual method binder, not the first alpha-equivalent contract context");
  const unused = { identity: "method:Unused", name: "Unused", constraints: [] };
  const withUnused = { ...first, typeParameters: [...first.typeParameters, unused] };
  for (const [purpose, changed] of [
    ["unused binder identity", { ...unused, identity: "method:OtherUnused" }],
    ["unused binder name", { ...unused, name: "OtherUnused" }],
    ["unused keyword constraint", { ...unused, constraints: [{ kind: "keyword", keyword: "struct" }] }],
  ]) {
    assert.notEqual(csharpTypeEmissionKey(carrier([{ ...first, typeParameters: [...first.typeParameters, changed] }])),
      csharpTypeEmissionKey(carrier([withUnused])), purpose);
  }
  const original = carrier([first]);
  for (const [purpose, parameter] of [
    ["carrier binder spelling", { ...outer, name: "DifferentOuter" }],
    ["completed carrier constraints", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } }],
    ["carrier helper dependency", { ...outer, csharpRequirementDependencies: [csharpSourcePrimitiveTargetType("int64")] }],
  ]) {
    assert.notEqual(csharpTypeEmissionKey({ ...original, typeArguments: [parameter] }), csharpTypeEmissionKey(original), purpose);
  }
});

test("Native emission identity follows complete callable metadata through nested physical types", () => {
  const first = member("method:First");
  const second = member("method:Second", "construct");
  const original = carrier([first, second]);
  const changed = carrier([first, { ...second, signature: { ...second.signature, returnPassing: "byref-readonly" } }]);
  for (const [purpose, wrap] of [
    ["array", type => ({ kind: "array", element: type })],
    ["tuple", type => ({ kind: "tuple", elements: [type] })],
    ["pointer", type => ({ kind: "pointer", pointee: type })],
    ["function pointer", type => ({ kind: "function-pointer", args: [type], result: type })],
    ["delegate", type => csharpDelegateTargetType("System.Func", [type], type)],
    ["task result", type => ({ ...carrier([]), csharpTaskResultType: type })],
  ]) {
    assert.equal(targetTypeRefEquals(wrap(original), wrap(changed)), true, `${purpose}: physical identity remains unchanged`);
    assert.notEqual(csharpTypeEmissionKey(wrap(original)), csharpTypeEmissionKey(wrap(changed)),
      `${purpose}: nested callable metadata retains its actual complete emission context`);
  }
});

test("Native emission identity encodes shared callable metadata without expanding every signature path", () => {
  let value = csharpSourcePrimitiveTargetType("int32");
  const lengths = [];
  for (let depth = 1; depth <= 64; depth += 1) {
    value = { ...carrier([]), id: `test:SharedCallable${depth}`, csharpTaskResultType: value,
      csharpCallableMembers: [{ name: "Invoke", typeParameters: [], signature: { kind: "call",
        parameters: [value, value], parameterPassingModes: ["by-value", "by-value"], returnType: value } }] };
    if (depth === 32 || depth === 64) lengths.push(csharpTypeEmissionKey(value).length);
  }
  assert.equal(lengths[1] < lengths[0] * 3, true,
    "doubling a shared Native metadata chain retains bounded graph data rather than an exponential signature tree");
});
