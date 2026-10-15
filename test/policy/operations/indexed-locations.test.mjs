import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsArrayElementPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType } from "../../../dist/policy/types/resolution/surface-types.js";

const element = { kind: "source-primitive", name: "int32" };

function select(policy, carrier, readonly = false) {
  return policy.select({
    host: { types: { resolveSelectedValue: () => carrier } },
    source: { receiver: { expression: {}, type: {} } },
    sourceFile: {},
    readonly,
  });
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
  const unknown = select(csharpJsArrayElementPolicies[0], { kind: "target-named", id: "fixture.Indexer" });
  assert.equal(unknown.kind, "rejected");
});
