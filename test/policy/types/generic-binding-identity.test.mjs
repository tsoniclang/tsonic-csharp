import assert from "node:assert/strict";
import test from "node:test";
import { targetTypeRefEquals, targetTypeRefKey, scopedTargetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpTargetStorageIdentityEquals } from "../../../dist/policy/types/storage/storage-identity.js";
import { substituteTargetTypeParameters, inferCsharpTargetTypeParameterBindings } from "../../../dist/target-model/types/substitution.js";
import { csharpGeneratedTypeParameterNames } from "../../../dist/target-model/names/type-parameters.js";
import { csharpFreeTypeParameterIdentities, csharpObjectShapeTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-types.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpObjectShapeMemberTypeKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { dotnetTypeRefKey } from "../../../dist/providers/native/model/type-refs.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { resolveCsharpOptionalStorage } from "../../../dist/target-model/types/carriers/optional-storage.js";
import { csharpConstraintsRequireReference } from "../../../dist/target-model/types/generic-constraints.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { isCsharpReferenceCarrier } from "../../../dist/target-model/types/identity.js";

const outer = Object.freeze({ kind: "type-parameter", identity: "source:outer/0", name: "T" });
const inner = Object.freeze({ kind: "type-parameter", identity: "source:inner/0", name: "T" });
const integer = Object.freeze({ kind: "source-primitive", name: "int32" });

test("native optional projections close only with exact selected reference constraints", () => {
  const nominal = csharpTargetNamedType("fixture.NativeBase", undefined, { kind: "named", name: "NativeBase" },
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  const unprovedClass = csharpTargetNamedType("fixture.NoReferenceGuarantee", undefined, { kind: "named", name: "NoReferenceGuarantee" },
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  const interfaceType = csharpTargetNamedType("fixture.NativeInterface", undefined, { kind: "named", name: "NativeInterface" },
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "interface" });
  const reference = { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const nominalParameter = { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: nominal }] } };
  const dependent = { ...inner, csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: reference }] } };
  for (const [label, element, expected] of [
    ["class", reference, true], ["nominal", nominalParameter, true], ["dependent", dependent, true],
    ["unconstrained", { ...outer, csharpConstraints: { kind: "resolved", constraints: [] } }, false],
    ["interface", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: interfaceType }] } }, false],
    ["class-kind-without-native-proof", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "type", type: unprovedClass }] } }, false],
    ["constructor", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "constructor" }] } }, false],
    ["notnull", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "notnull" }] } }, false],
    ["struct", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "struct" }] } }, false],
    ["unmanaged", { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "unmanaged" }] } }, false],
    ["missing", outer, false],
    ["unsupported", { ...outer, csharpConstraints: { kind: "unsupported", reason: "no selected native proof" } }, false],
  ]) {
    const proof = element.csharpConstraints;
    assert.equal(proof?.kind === "resolved" && csharpConstraintsRequireReference(proof.constraints), expected,
      `${label}: exact selected class evidence, never a name or default`);
    assert.equal(isCsharpReferenceCarrier(element), expected,
      `${label}: conversion and operation consumers use the same native reference proof`);
    const contract = { kind: "optional", part: "operations", arguments: [element] };
    const operations = resolveCsharpOptionalStorage(contract, element);
    const storage = resolveCsharpOptionalStorage({ ...contract, part: "storage" }, element);
    const optional = csharpNullableTargetType(element);
    if (expected) {
      assert.equal(operations.kind === "target-named" && operations.id === "Tsonic.CSharp.Runtime.ReferenceOptionalStorage`1", true,
        `${label}: the existing native reference operations are selected`);
      assert.equal(operations.typeArguments.length === 1 && operations.typeArguments[0] === element, true,
        `${label}: no erased or boxed payload`);
      assert.equal(storage.kind === "type-parameter" && storage.identity === element.identity && storage.csharpNullableReference === true, true,
        `${label}: native T? retains binder identity`);
      assert.equal(targetTypeRefEquals(optional, storage), true, `${label}: optional normalization has one owner`);
      const projected = csharpProjectedType({ kind: "optional", part: "storage", arguments: [element] });
      assert.equal(targetTypeRefEquals(csharpNullableTargetType(projected), storage), true,
        `${label}: an existing projected carrier closes when its actual payload bound is already selected`);
      assert.equal(storage.csharpConstraints === proof, true, `${label}: selected native constraints remain unchanged`);
    } else {
      assert.equal(operations.kind === "type-parameter" && operations.csharpProjection?.part === "operations", true,
        `${label}: a real unknown requirement is not guessed away`);
      assert.equal(storage.kind === "type-parameter" && storage.csharpProjection?.part === "storage", true,
        `${label}: the existing generic optional layout remains supported`);
    }
  }
});

test("optional substitution closes new selected bounds without changing a binder identity", () => {
  const storage = csharpNullableTargetType(outer);
  const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [outer] });
  const selected = { ...outer, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const bindings = new Map([[outer.identity, selected]]);
  const actualStorage = substituteTargetTypeParameters(storage, bindings);
  const actualOperations = substituteTargetTypeParameters(operations, bindings);
  assert.equal(actualStorage.csharpNullableReference === true && actualStorage.identity === outer.identity, true,
    "new native evidence changes optional representation even when the semantic binder identity is equal");
  assert.equal(actualOperations.kind === "target-named" && actualOperations.id === "Tsonic.CSharp.Runtime.ReferenceOptionalStorage`1", true,
    "operations and storage close through the same existing native selection");
  assert.equal(actualOperations.typeArguments[0] === selected, true, "the exact selected native payload is preserved");
  assert.equal(storage.csharpProjection?.part === "storage" && operations.csharpProjection?.part === "operations", true,
    "the original unconstrained source metadata is not mutated");
});

test("projection dependencies retain exact free identities through nested optional carriers", () => {
  const optional = csharpNullableTargetType(outer);
  const nested = csharpNullableTargetType(optional);
  const carrier = { kind: "tuple", elements: [optional, { kind: "array", element: inner }, nested, integer] };
  assert.deepEqual(csharpFreeTypeParameterIdentities([carrier]), new Set([outer.identity, inner.identity]));
  assert.deepEqual(csharpFreeTypeParameterIdentities([integer]), new Set());
  assert.deepEqual(csharpFreeTypeParameterIdentities([csharpDelegateTargetType("System.Func", [optional], inner)]),
    new Set([outer.identity, inner.identity]));
});

test("generic template binding retains declared optional storage identities before value projection", () => {
  const storage = csharpNullableTargetType(outer);
  const selectedStorage = csharpNullableTargetType(inner);
  const pattern = { kind: "tuple", elements: [outer, storage] };
  const actual = { kind: "tuple", elements: [inner, selectedStorage] };
  const identities = new Set([outer.identity, storage.identity]);
  const bindings = inferCsharpTargetTypeParameterBindings(pattern, actual, identities);
  assert.deepEqual(bindings, new Map([[outer.identity, inner], [storage.identity, selectedStorage]]));
  assert.deepEqual(substituteTargetTypeParameters(pattern, bindings), actual);
  assert.equal(inferCsharpTargetTypeParameterBindings({ kind: "tuple", elements: [storage, storage] },
    { kind: "tuple", elements: [selectedStorage, integer] }, identities), undefined);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(storage, csharpAbsenceTargetType(), new Set([outer.identity])), new Map());
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
    typeParameters: [{ csharpAllowsRefLike: false, ...parameter, declaration: {}, constraints: [] }] });
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

test("native generic binding validates derived optional arguments after binding their payload", () => {
  const storage = csharpNullableTargetType(outer);
  const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [outer] });
  const box = typeArguments => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: typeArguments.map(() => false), id: "test.Box", typeArguments });
  const pattern = box([operations, storage, outer]);
  const identities = new Set([outer.identity]);
  const carriers = [integer, csharpNullableTargetType(integer), { kind: "source-primitive", name: "string" }, inner];
  for (const element of carriers) {
    const selectedOperations = resolveCsharpOptionalStorage(operations.csharpProjection, element);
    const selectedStorage = resolveCsharpOptionalStorage(storage.csharpProjection, element);
    assert.deepEqual(substituteTargetTypeParameters(pattern, new Map([[outer.identity, element]])),
      box([selectedOperations, selectedStorage, element]));
    assert.deepEqual(inferCsharpTargetTypeParameterBindings(pattern,
      box([selectedOperations, selectedStorage, element]), identities), new Map([[outer.identity, element]]));
    assert.equal(inferCsharpTargetTypeParameterBindings(pattern,
      box([selectedStorage, selectedOperations, element]), identities), undefined);
  }
  const actual = box([
    resolveCsharpOptionalStorage(operations.csharpProjection, integer),
    csharpNullableTargetType(integer),
    { kind: "source-primitive", name: "int64" },
  ]);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern, actual, identities), undefined);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern,
    { ...actual, id: "test.DifferentBox" }, identities), undefined);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(box([storage]),
    box([csharpNullableTargetType(integer)]), identities), new Map([[outer.identity, integer]]));
  assert.equal(inferCsharpTargetTypeParameterBindings(box([storage]), box([csharpAbsenceTargetType()]), identities), undefined);
  assert.equal(inferCsharpTargetTypeParameterBindings(box([storage]), box([integer]), identities), undefined);
});
