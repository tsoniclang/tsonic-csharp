import assert from "node:assert/strict";
import test from "node:test";
import { targetTypeRefEquals, targetTypeRefKey, scopedTargetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpTargetStorageIdentityEquals } from "../../../dist/policy/types/storage/storage-identity.js";
import { substituteTargetTypeParameters, inferCsharpTargetTypeParameterBindings } from "../../../dist/policy/types/callables/substitution.js";
import { csharpGeneratedTypeParameterNames } from "../../../dist/target-model/names/type-parameters.js";
import { csharpFreeTypeParameterIdentities, csharpObjectShapeTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-types.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { csharpObjectShapeMemberTypeKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { dotnetTypeRefKey } from "../../../dist/providers/native/model/type-refs.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";

const outer = Object.freeze({ kind: "type-parameter", identity: "source:outer/0", name: "T" });
const inner = Object.freeze({ kind: "type-parameter", identity: "source:inner/0", name: "T" });
const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

test("projection dependencies retain exact free identities through nested optional carriers", () => {
  const optional = csharpNullableTargetType(outer);
  const nested = csharpNullableTargetType(optional);
  const carrier = { kind: "tuple", elements: [optional, { kind: "array", element: inner }, nested, integer] };
  assert.deepEqual(csharpFreeTypeParameterIdentities([carrier]), new Set([outer.identity, inner.identity]));
  assert.deepEqual(csharpFreeTypeParameterIdentities([integer]), new Set());
  assert.deepEqual(csharpFreeTypeParameterIdentities([csharpDelegateTargetType("System.Func", [optional], inner)]),
    new Set([outer.identity, inner.identity]));
});

test("generic semantic and storage identity never collapse equal spellings", () => {
  const renamed = { ...outer, name: "CapturedT" };
  assert.equal(targetTypeRefEquals(outer, inner), false);
  assert.equal(csharpTargetStorageIdentityEquals(outer, inner), false);
  assert.notEqual(targetTypeRefKey(outer), targetTypeRefKey(inner));
  assert.notEqual(dotnetTypeRefKey(outer), dotnetTypeRefKey(inner));
  assert.equal(targetTypeRefEquals(outer, renamed), true);
  assert.equal(csharpTargetStorageIdentityEquals(outer, renamed), true);
  assert.equal(targetTypeRefKey(outer), targetTypeRefKey(renamed));
  assert.equal(dotnetTypeRefKey(outer), dotnetTypeRefKey(renamed));
  assert.deepEqual(substituteTargetTypeParameters({ kind: "tuple", elements: [outer, inner] },
    new Map([[outer.identity, integer]])), { kind: "tuple", elements: [integer, inner] });
  assert.equal(inferCsharpTargetTypeParameterBindings(inner, integer, new Set([outer.identity])), undefined);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(inner, integer, new Set([inner.identity])), new Map([[inner.identity, integer]]));
});

test("quantified signatures remain alpha-equivalent without capturing free parameters", () => {
  const other = { ...inner, identity: "source:other/0", name: "U" };
  const member = parameter => ({ sourceName: "pair", targetName: "pair", sourceKey: { kind: "property", name: "pair" },
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [parameter], { kind: "tuple", elements: [outer, parameter] }),
    typeParameters: [{ ...parameter, declaration: {}, constraints: [] }] });
  assert.equal(csharpObjectShapeMemberTypeKey(member(inner)), csharpObjectShapeMemberTypeKey(member(other)));
  assert.deepEqual(csharpObjectShapeTypeParameters([member(inner)], []), [outer]);
  assert.notEqual(scopedTargetTypeRefKey(outer, new Map([[inner.identity, 0]])), scopedTargetTypeRefKey(inner, new Map([[inner.identity, 0]])));
  const changed = member(other);
  changed.type = csharpDelegateTargetType("System.Func", [other], { kind: "tuple", elements: [inner, other] });
  assert.notEqual(csharpObjectShapeMemberTypeKey(member(inner)), csharpObjectShapeMemberTypeKey(changed));
});

test("optional absence supplies no generic payload binding", () => {
  const absence = csharpAbsenceTargetType();
  const optional = csharpNullableTargetType(outer);
  const identities = new Set([outer.identity]);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(optional, absence, identities), new Map());
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(csharpNullableTargetType(integer), absence, identities), new Map());
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(optional, integer, identities), new Map([[outer.identity, integer]]));
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(optional, csharpNullableTargetType(integer), identities), new Map([[outer.identity, integer]]));
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(outer, absence, identities), new Map([[outer.identity, absence]]));
  assert.equal(inferCsharpTargetTypeParameterBindings(integer, absence, identities), undefined);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(
    { kind: "tuple", elements: [optional, outer] },
    { kind: "tuple", elements: [absence, integer] }, identities), new Map([[outer.identity, integer]]));
  assert.equal(inferCsharpTargetTypeParameterBindings(
    { kind: "tuple", elements: [optional, outer] },
    { kind: "tuple", elements: [integer, { kind: "source-primitive", name: "string" }] }, identities), undefined);
});

test("generated generic scopes reserve authored binders and render nested references consistently", () => {
  const reserved = { kind: "type-parameter", identity: "source:reserved/0", name: "CapturedT" };
  const names = csharpGeneratedTypeParameterNames([outer, reserved], [inner.name]);
  assert.equal(names.get(outer.identity), "CapturedT2");
  assert.equal(names.get(reserved.identity), "CapturedT");
  assert.equal(names.has(inner.identity), false);
  assert.deepEqual(csharpTypeFromTargetTypeRef(outer, undefined), { kind: "IdentifierName", name: "T" });
  assert.deepEqual(csharpTypeFromTargetTypeRef(outer, names), { kind: "IdentifierName", name: "CapturedT2" });
  assert.deepEqual(csharpTypeFromTargetTypeRef(inner, names), { kind: "IdentifierName", name: "T" });
  assert.deepEqual(csharpTypeFromTargetTypeRef({ kind: "array", element: outer }, names), {
    kind: "ArrayType", elementType: { kind: "IdentifierName", name: "CapturedT2" },
  });
  assert.equal(outer.name, "T");
  assert.equal(inner.name, "T");
});
