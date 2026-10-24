import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpMethodValueType, csharpMethodValueCoversContract, csharpMethodValueContractsEqual,
  csharpPresentObjectShapeMethod,
} from "../../../dist/target-model/types/method-values.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpObjectShapeContractKey, csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { substituteTargetTypeParameters, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { csharpCopiedObjectShapeMembers } from "../../../dist/policy/types/objects/method-environments.js";
import { selectCsharpObjectMemberEmission } from "../../../dist/policy/types/objects/object-members.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";

const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "tsonic.shape:owner", typeArguments: [{ kind: "type-parameter", identity: "Outer", name: "Outer" }],
  csharpRender: { kind: "named", name: "Owner" } };
function contract(name) {
  const type = { kind: "type-parameter", identity: name, name };
  return csharpDelegateTargetType("System.Func", [type], type);
}
const methodValue = (name, method = "identity") => csharpMethodValueType(owner, method, method, contract(name), [name]);
const unconstrained = () => ({ kind: "resolved", constraints: [] });
const abstractMethodStorage = Object.freeze({
  memberSubjectFor: () => assert.fail("a quantified abstract contract has no ordinary authored method slot"),
  memberWritesFor: () => assert.fail("a quantified abstract contract needs no ordinary-method exposure proof"),
});

test("a quantified method reference renders only its existing native environment", () => {
  const value = methodValue("Item");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.csharpMethodValue), true);
  assert.equal(Object.isFrozen(value.csharpMethodValue.typeParameters), true);
  assert.deepEqual(csharpTypeFromTargetTypeRef(value), csharpTypeFromTargetTypeRef(owner));
  assert.equal(targetTypeRefEquals(value, owner), false);
  assert.equal(targetTypeRefEquals(value, methodValue("Item", "other")), false);
  assert.equal(csharpMethodValueCoversContract(value, contract("Item")), true);
  assert.equal(csharpMethodValueCoversContract(value, csharpDelegateTargetType("System.Action", [])), false);
});

test("nullable quantified callable storage renders the original environment with one native absence", () => {
  const value = methodValue("Item");
  const nullable = csharpNullableTargetType(value);
  const rendered = csharpTypeFromTargetTypeRef(nullable);
  assert.deepEqual(rendered, { kind: "NullableType", inner: csharpTypeFromTargetTypeRef(value) });
  assert.deepEqual(csharpTypeFromTargetTypeRef(csharpNullableTargetType(nullable)), rendered);
  const scalar = { kind: "source-primitive", name: "float64" };
  const selected = substituteTargetTypeParameters(nullable, new Map([["Outer", scalar]]));
  assert.deepEqual(csharpTypeFromTargetTypeRef(selected), {
    kind: "NullableType", inner: csharpTypeFromTargetTypeRef(substituteTargetTypeParameters(value, new Map([["Outer", scalar]]))),
  });
});

test("free environment substitution cannot capture the method's own quantifiers", () => {
  const value = methodValue("Item");
  const scalar = { kind: "source-primitive", name: "float64" };
  const selected = substituteTargetTypeParameters(value, new Map([["Outer", scalar], ["Item", scalar]]));
  assert.deepEqual(selected.csharpMethodValue.owner.typeArguments, [scalar]);
  assert.deepEqual(selected.csharpMethodValue.contract, contract("Item"));
  assert.equal(csharpMethodValueContractsEqual(value, methodValue("Other")), true);
  assert.equal(csharpMethodValueContractsEqual(value, methodValue("Item", "different")), false);
});

test("method references require exact native reference ownership and unique quantifiers", () => {
  const scalar = { kind: "source-primitive", name: "float64" };
  const signature = csharpDelegateTargetType("System.Func", [scalar], scalar);
  const monomorphic = csharpMethodValueType(owner, "identity", "identity", signature, []);
  assert.deepEqual(monomorphic.csharpMethodValue.typeParameters, []);
  assert.equal(csharpMethodValueCoversContract(monomorphic, signature), true);
  assert.equal(csharpMethodValueType({ ...owner, csharpValueType: true }, "identity", "identity", contract("Item"), ["Item"]), undefined);
  assert.equal(csharpMethodValueType(owner, "identity", "identity", contract("Item"), []), undefined);
  assert.equal(csharpMethodValueType(owner, "identity", "identity", contract("Item"), ["Item", "Item"]), undefined);
  assert.equal(csharpMethodValueType({ ...owner, id: "Nominal" }, "identity", "identity", contract("Item"), ["Item"]), undefined);
});

test("optional native method storage retains a required present protocol without weakening member identity", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", optional: true, type: csharpNullableTargetType(contract("Item")),
    typeParameters: [{ csharpAllowsRefLike: false, identity: "Item", name: "Item", declaration: {}, constraints: [] }] };
  const recorded = [];
  const shape = retainCsharpMethodValueContracts({ targetType: { ...owner, csharpStructuralContract: true }, members: [member] },
    fact => { recorded.push(fact); return fact; }, unconstrained, abstractMethodStorage);
  assert.equal(shape.members[0].optional, true);
  assert.equal(recorded[0].members[0].optional, undefined);
  assert.equal(getCsharpNullableElementTargetType(recorded[0].members[0].type), undefined);
  assert.equal(shape.implements, undefined);
  assert.notEqual(csharpObjectShapeMemberContractKey(member), csharpObjectShapeMemberContractKey(recorded[0].members[0]));
  assert.deepEqual(csharpPresentObjectShapeMethod(member).type, contract("Item"));
  assert.equal(csharpPresentObjectShapeMethod({ ...member, memberKind: "property" }), undefined);
  assert.equal(csharpPresentObjectShapeMethod({ ...member, type: owner }), undefined);
  for (const changed of [{ ...member, targetName: "other" }, { ...member, bound: true },
    { ...member, sourceKey: { kind: "property", name: "other" } }]) {
    assert.notEqual(csharpObjectShapeMemberContractKey(csharpPresentObjectShapeMethod(changed)),
      csharpObjectShapeMemberContractKey(csharpPresentObjectShapeMethod(member)));
  }
});

test("copied generic methods retain only the exact original environment and minimal method contract", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: contract("Item"), typeParameters: [{ csharpAllowsRefLike: false, identity: "Item", name: "Item", declaration: {}, constraints: [] }] };
  const recorded = [];
  const shape = retainCsharpMethodValueContracts({ targetType: owner, members: [member],
    methodImplementation: { declaration: {}, identity: "body", methods: [], captures: [] } }, fact => { recorded.push(fact); return fact; },
  unconstrained, abstractMethodStorage);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].members.length, 1);
  assert.equal(targetTypeRefEquals(recorded[0].targetType, shape.members[0].methodValueContract), true);
  const copiedBody = csharpCopiedObjectShapeMembers(shape)[0].methodValueStorage;
  assert.equal(copiedBody.kind, "protocol", "a copied native body has an exact invocation descriptor");
  assert.equal(targetTypeRefEquals(copiedBody.type, owner), true);
  assert.equal(copiedBody.invocationName, "identity", "the concrete native body keeps its real direct method entry");
  const copiedMember = csharpCopiedObjectShapeMembers(shape)[0];
  const copiedSelection = selectCsharpObjectMemberEmission({ shape: { targetType: owner, members: [copiedMember] }, member: copiedMember,
    receiverBound: false, authored: false, deferred: false, implementsInterface: true, nativeField: undefined });
  assert.equal(copiedSelection.kind === "selected" && copiedSelection.value.declaration.kind === "copied", true,
    "a concrete native environment retains its canonical copied-method declaration");
  assert.equal(copiedSelection.value.declaration.invocationName, "identity", "the field invokes its actual concrete native method");
  assert.equal(copiedSelection.value.declaration.bodyInvocationName, "__tsonic_invoke_body_identity",
    "the implemented protocol has a separately selected immutable entry");
  assert.equal(targetTypeRefEquals(copiedSelection.value.declaration.interface, shape.members[0].methodValueContract), true,
    "an explicit protocol implementation never mistakes the concrete native environment for an interface");
  const abstract = retainCsharpMethodValueContracts({ targetType: { ...owner, id: "tsonic.shape:interface", csharpStructuralContract: true },
    members: [member, { sourceKey: { kind: "property", name: "extra" }, sourceName: "extra", targetName: "extra",
      memberKind: "property", type: { kind: "source-primitive", name: "float64" } }] }, fact => fact, unconstrained, abstractMethodStorage);
  const copied = csharpCopiedObjectShapeMembers(abstract);
  assert.equal(targetTypeRefEquals(copied[0].methodValueStorage.type, shape.members[0].methodValueContract), true);
  assert.equal(copied[0].methodValueStorage.invocationName, "__tsonic_invoke_body_identity", "a protocol copy retains its immutable entry");
  assert.equal(copied[1].methodValueStorage, undefined);
  const instantiated = substituteObjectShapeFactTargetTypeParameters({ ...shape, members: csharpCopiedObjectShapeMembers(shape) },
    new Map([["Outer", { kind: "source-primitive", name: "string" }]]));
  assert.equal(instantiated.members[0].methodValueStorage.type.typeArguments[0].name, "string");
  assert.equal(instantiated.members[0].methodValueStorage.invocationName, "identity", "substitution preserves the selected native entry");
  assert.equal(instantiated.members[0].typeParameters[0].name, "Item");
});

test("native method-value storage identity includes the exact immutable invocation entry", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: contract("Item"), methodValueStorage: { kind: "protocol", type: owner, invocationName: "identity" } };
  const shape = { targetType: owner, members: [member] };
  const same = { ...shape, members: [{ ...member, methodValueStorage: { ...member.methodValueStorage } }] };
  const other = { ...shape, members: [{ ...member, methodValueStorage: { ...member.methodValueStorage, invocationName: "other" } }] };
  assert.equal(csharpObjectShapesEqual(shape, same), true, "equal native receiver and entry have one physical storage contract");
  assert.equal(csharpObjectShapeContractKey(shape), csharpObjectShapeContractKey(same), "equal storage has one canonical shape key");
  assert.equal(csharpObjectShapesEqual(shape, other), false, "a different method on the same native receiver is not the same callable");
  assert.notEqual(csharpObjectShapeContractKey(shape), csharpObjectShapeContractKey(other), "physical shape keys cannot erase invocation identity");
  assert.equal(targetTypeRefEquals(createStructuralObjectShapeTarget(shape.members, undefined, unconstrained),
    createStructuralObjectShapeTarget(same.members, undefined, unconstrained)), true,
  "one physical receiver and immutable entry produce one native object declaration");
  assert.equal(targetTypeRefEquals(createStructuralObjectShapeTarget(shape.members, undefined, unconstrained),
    createStructuralObjectShapeTarget(other.members, undefined, unconstrained)), false,
  "native object declaration identity includes its required invocation selection");
  const copied = csharpCopiedObjectShapeMembers({ ...shape, members: [{ ...member, optional: true,
    methodValueStorage: { ...member.methodValueStorage, type: csharpNullableTargetType(owner) } }] });
  assert.equal(copied[0].methodValueStorage.invocationName, "identity", "a copied optional value retains its original native entry");
  assert.equal(getCsharpNullableElementTargetType(copied[0].methodValueStorage.type) === owner, true,
    "optional native method storage retains exactly its one physical absence state");
});
