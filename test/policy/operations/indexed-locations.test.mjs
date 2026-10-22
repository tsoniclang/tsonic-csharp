import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsArrayElementPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpSourceProfileInputs } from "../../helpers/planning-records.mjs";

const element = { kind: "source-primitive", name: "int32" };

function select(policy, carrier, readonly = false) {
  const host = { types: { resolveSelectedValue: () => carrier } };
  const source = { receiver: { expression: {}, type: {} } };
  const sourceFile = {};
  // The element policy reads the receiver carrier from the input facts the analysis resolves for the access.
  return policy.select({ host, source, sourceFile, readonly,
    inputs: csharpSourceProfileInputs(host, sourceFile, { values: [source.receiver] }) });
}

test("source array location selection retains its exact native method and index type", () => {
  const carrier = csharpJsArrayTargetType(element);
  const selected = select(csharpJsArrayElementPolicies[0], carrier);
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.invocation, { kind: "indexer", indexedLocationMethod: "elementLocation" });
  assert.deepEqual(selected.targetMember.declaringType, carrier);
  assert.deepEqual(selected.targetMember.returnType, element);
  assert.deepEqual(selected.targetMember.parameters[0].type, { kind: "source-primitive", name: "float64" });
  assert.equal(csharpJsArrayElementPolicies.length, 1);
  assert.deepEqual(csharpJsArrayElementPolicies[0].source.declaringNames, ["Array", "ReadonlyArray"]);
  const readonly = select(csharpJsArrayElementPolicies[0], carrier, true);
  assert.equal(readonly.kind, "resolved");
  assert.equal(readonly.targetMember.readonly, true);
  assert.equal(readonly.invocation.indexedLocationMethod, undefined);
});

test("native arrays and unregistered indexers cannot inherit source-array location identity", () => {
  const native = select(csharpJsArrayElementPolicies[0], { kind: "array", element });
  assert.equal(native.kind, "resolved");
  assert.equal(native.invocation.indexedLocationMethod, undefined);
  const unknown = select(csharpJsArrayElementPolicies[0], { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Indexer" });
  assert.equal(unknown.kind, "rejected");
});
