import assert from "node:assert/strict";
import test from "node:test";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpConstraintsRequireReference, csharpTypeParameterConstraintResolutionKey } from "../../../dist/target-model/types/generic-constraints.js";
import { csharpTypeParameterConstraintsEqual } from "../../../dist/policy/constraints/type-parameter-constraints.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { csharpTargetTypeFromBinding } from "../../../dist/policy/types/storage/bindings.js";

const resolved = type => Object.freeze({ kind: "resolved", constraints: Object.freeze([{ kind: "type", type }]) });
const named = proof => csharpTargetNamedType("Actual::Example.Base", undefined, undefined,
  { allowsRefLikeTypeArguments: [], ...(proof ? { constraintRequiresReferenceType: true } : {}) });

test("selected class-bound proof is strict immutable evidence, not a native type or clause identity", () => {
  const unknown = named(false);
  const proven = named(true);
  assert.equal(isCsharpTargetTypeRef(proven), true, "a positive selected proof is valid");
  assert.equal(snapshotCsharpTargetTypes([proven])[0].csharpConstraintRequiresReferenceType, true,
    "the immutable target snapshot preserves the proof");
  assert.equal(targetTypeRefEquals(unknown, proven), true, "actual native type identity is unchanged");
  assert.equal(targetTypeRefKey(unknown), targetTypeRefKey(proven), "the native type key is unchanged");
  assert.equal(csharpTypeParameterConstraintsEqual(resolved(unknown).constraints, resolved(proven).constraints), true,
    "the native rendered clause is unchanged");
  assert.notEqual(csharpTypeParameterConstraintResolutionKey(resolved(unknown)),
    csharpTypeParameterConstraintResolutionKey(resolved(proven)), "constraint evidence detects the newly proved guarantee");
  assert.equal(csharpConstraintsRequireReference(resolved(unknown).constraints), false, "absence does not prove reference-only arguments");
  assert.equal(csharpConstraintsRequireReference(resolved(proven).constraints), true, "the canonical reader consumes the selected proof");
  for (const invalid of [false, 1, "true", null]) {
    assert.throws(() => csharpTargetNamedType("Actual::Example.Base", undefined, undefined,
      { allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: invalid }), TypeError,
    "a supplied non-true proof is refused");
    assert.equal(isCsharpTargetTypeRef({ ...unknown, csharpConstraintRequiresReferenceType: invalid }), false,
      "a malformed selected proof cannot cross the seal");
  }
  for (const trait of ["csharpValueType", "csharpByRefLike"]) {
    assert.equal(isCsharpTargetTypeRef({ ...proven, [trait]: true }), false,
      `${trait}: value storage cannot supply a reference-only bound proof`);
  }
  for (const kind of ["struct", "enum", "interface"]) {
    assert.equal(isCsharpTargetTypeRef({ ...proven, csharpSourceDeclarationKind: kind }), false,
      `${kind}: a contradictory selected declaration kind cannot supply the bound proof`);
    assert.throws(() => csharpTargetNamedType("Actual::Example.Bound", undefined, undefined,
      { allowsRefLikeTypeArguments: [], sourceDeclarationKind: kind, constraintRequiresReferenceType: true }), TypeError,
    `${kind}: the canonical producer refuses contradictory input`);
  }
});

test("one canonical reader retains transitive proof without nominal-class or name inference", () => {
  const root = named(true);
  const parent = { kind: "type-parameter", identity: "source:outer:0", name: "Value", csharpConstraints: resolved(root) };
  const child = { kind: "type-parameter", identity: "source:inner:0", name: "Value", csharpConstraints: resolved(parent) };
  assert.equal(csharpConstraintsRequireReference(resolved(child).constraints), true, "dependent generic bounds retain the positive proof");
  const unknownParent = { ...parent, csharpConstraints: resolved(named(false)) };
  const unknownChild = { ...child, csharpConstraints: resolved(unknownParent) };
  assert.notEqual(csharpTypeParameterConstraintResolutionKey(resolved(child)),
    csharpTypeParameterConstraintResolutionKey(resolved(unknownChild)), "effective transitive proof changes the evidence key");
  const nominalOnly = csharpTargetNamedType("NotCore::System.Enum", undefined,
    { kind: "named", namespace: ["System"], name: "Enum" },
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  assert.equal(csharpConstraintsRequireReference(resolved(nominalOnly).constraints), false,
    "neither a class stamp nor rendered spelling proves native reference-only bounds");
  assert.equal(csharpConstraintsRequireReference([{ kind: "keyword", keyword: "class" }]), true,
    "the actual explicit native class constraint remains authoritative");
  for (const keyword of ["struct", "unmanaged", "notnull"]) {
    assert.equal(csharpConstraintsRequireReference([{ kind: "keyword", keyword }]), false,
      `${keyword}: a non-reference guarantee is not promoted`);
  }
});

test("native instantiation and substitution transport the selected proof without a provider re-query", () => {
  const parameter = { kind: "type-parameter", identity: "source:Box:0", name: "Value" };
  const generic = csharpTargetNamedType("Actual::Example.Box`1", [parameter], undefined,
    { allowsRefLikeTypeArguments: [false], constraintRequiresReferenceType: true });
  const integer = { kind: "source-primitive", name: "int32" };
  const substituted = substituteTargetTypeParameters(generic, new Map([[parameter.identity, integer]]));
  assert.equal(substituted.csharpConstraintRequiresReferenceType, true, "substitution retains selected evidence");
  const binding = { id: generic.id, sourceName: "Box", targetName: "Example.Box", target: "csharp", kind: "class",
    csharpType: generic, typeParameters: [{ identity: parameter.identity, name: parameter.name, csharpAllowsRefLike: false }] };
  const instantiated = csharpTargetTypeFromBinding(binding, [integer]);
  assert.equal(instantiated.csharpConstraintRequiresReferenceType, true, "canonical binding instantiation retains selected evidence");
  assert.equal(instantiated.typeArguments[0].kind, "source-primitive", "the same canonical instantiation replaces its binder");
  assert.equal(instantiated.typeArguments[0].name, "int32", "the exact argument is retained");
});
