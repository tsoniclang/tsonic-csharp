import assert from "node:assert/strict";
import test from "node:test";
import { csharpGenericMethodValueType, csharpGenericMethodValueCoversContract, csharpGenericMethodValueContractsEqual } from "../../../dist/target-model/types/generic-method-values.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/callables/substitution.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-types.js";
import { retainCsharpMethodValueContracts, csharpCopiedObjectShapeMembers } from "../../../dist/policy/types/objects/object-shape-policy/method-values.js";
import { substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/callables/substitution.js";

const owner = { kind: "target-named", id: "tsonic.shape:owner", typeArguments: [{ kind: "type-parameter", name: "Outer" }],
  csharpRender: { kind: "named", name: "Owner" } };
function contract(name) {
  const type = { kind: "type-parameter", name };
  return csharpDelegateTargetType("System.Func", [type], type);
}
const methodValue = (name, method = "identity") => csharpGenericMethodValueType(owner, method, method, contract(name), [name]);

test("a quantified method reference renders only its existing native environment", () => {
  const value = methodValue("Item");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.csharpGenericMethodValue), true);
  assert.equal(Object.isFrozen(value.csharpGenericMethodValue.typeParameters), true);
  assert.deepEqual(csharpTypeFromTargetTypeRef(value), csharpTypeFromTargetTypeRef(owner));
  assert.equal(targetTypeRefEquals(value, owner), false);
  assert.equal(targetTypeRefEquals(value, methodValue("Item", "other")), false);
  assert.equal(csharpGenericMethodValueCoversContract(value, contract("Item")), true);
  assert.equal(csharpGenericMethodValueCoversContract(value, csharpDelegateTargetType("System.Action", [])), false);
});

test("free environment substitution cannot capture the method's own quantifiers", () => {
  const value = methodValue("Item");
  const scalar = { kind: "source-primitive", name: "float64" };
  const selected = substituteTargetTypeParameters(value, new Map([["Outer", scalar], ["Item", scalar]]));
  assert.deepEqual(selected.csharpGenericMethodValue.owner.typeArguments, [scalar]);
  assert.deepEqual(selected.csharpGenericMethodValue.contract, contract("Item"));
  assert.equal(csharpGenericMethodValueContractsEqual(value, methodValue("Other")), true);
  assert.equal(csharpGenericMethodValueContractsEqual(value, methodValue("Item", "different")), false);
});

test("method references require exact native reference ownership and unique quantifiers", () => {
  assert.equal(csharpGenericMethodValueType({ ...owner, csharpValueType: true }, "identity", "identity", contract("Item"), ["Item"]), undefined);
  assert.equal(csharpGenericMethodValueType(owner, "identity", "identity", contract("Item"), []), undefined);
  assert.equal(csharpGenericMethodValueType(owner, "identity", "identity", contract("Item"), ["Item", "Item"]), undefined);
  assert.equal(csharpGenericMethodValueType({ ...owner, id: "Nominal" }, "identity", "identity", contract("Item"), ["Item"]), undefined);
});

test("copied generic methods retain only the exact original environment and minimal method contract", () => {
  const member = { sourceKey: { kind: "property", name: "identity" }, sourceName: "identity", targetName: "identity",
    memberKind: "method", type: contract("Item"), typeParameters: [{ name: "Item", declaration: {}, constraints: [] }] };
  const recorded = [];
  const shape = retainCsharpMethodValueContracts({ targetType: owner, members: [member],
    methodImplementation: { declaration: {}, identity: "body", captures: [] } }, fact => { recorded.push(fact); return fact; });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].members.length, 1);
  assert.equal(targetTypeRefEquals(recorded[0].targetType, shape.members[0].methodValueContract), true);
  assert.equal(targetTypeRefEquals(csharpCopiedObjectShapeMembers(shape)[0].methodStorageType, owner), true);
  const abstract = retainCsharpMethodValueContracts({ targetType: { ...owner, id: "tsonic.shape:interface", csharpStructuralContract: true },
    members: [member, { sourceKey: { kind: "property", name: "extra" }, sourceName: "extra", targetName: "extra",
      memberKind: "property", type: { kind: "source-primitive", name: "float64" } }] }, fact => fact);
  const copied = csharpCopiedObjectShapeMembers(abstract);
  assert.equal(targetTypeRefEquals(copied[0].methodStorageType, shape.members[0].methodValueContract), true);
  assert.equal(copied[1].methodStorageType, undefined);
  const instantiated = substituteObjectShapeFactTargetTypeParameters({ ...shape, members: csharpCopiedObjectShapeMembers(shape) },
    new Map([["Outer", { kind: "source-primitive", name: "string" }]]));
  assert.equal(instantiated.members[0].methodStorageType.typeArguments[0].name, "string");
  assert.equal(instantiated.members[0].typeParameters[0].name, "Item");
});
