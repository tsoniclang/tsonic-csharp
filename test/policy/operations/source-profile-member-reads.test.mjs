import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsArrayElementPolicies, csharpJsArrayPropertyPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType } from "../../../dist/policy/types/resolution/surface-types.js";

const element = { kind: "source-primitive", name: "int64" };
const receiver = csharpJsArrayTargetType(element);

function context(carrier, readonly) {
  return {
    host: { types: { resolveSelectedValue: () => carrier } },
    source: { receiver: { expression: {}, type: {} }, writable: !readonly },
    sourceFile: {}, receiverType: carrier, readonly,
  };
}

test("synthesized array contributors retain one native member policy and checker-selected writability", () => {
  assert.equal(csharpJsArrayPropertyPolicies.length, 1);
  assert.equal(csharpJsArrayElementPolicies.length, 1);
  for (const readonly of [true, false]) {
    const property = csharpJsArrayPropertyPolicies[0].select(context(receiver, readonly));
    const index = csharpJsArrayElementPolicies[0].select(context(receiver, readonly));
    assert.equal(property.kind, "resolved");
    assert.equal(index.kind, "resolved");
    assert.deepEqual(property.targetMember.declaringType, receiver);
    assert.deepEqual(index.targetMember.declaringType, receiver);
    assert.deepEqual(index.targetMember.returnType, element);
    assert.equal(property.targetMember.readonly, readonly ? true : undefined);
    assert.equal(index.targetMember.readonly, readonly ? true : undefined);
    assert.equal(index.invocation.indexedLocationMethod, readonly ? undefined : "elementLocation");
  }
  for (const policy of [...csharpJsArrayPropertyPolicies, ...csharpJsArrayElementPolicies]) {
    assert.deepEqual(policy.source.declaringNames, ["Array", "ReadonlyArray"]);
    assert.equal(policy.source.declaringName, undefined);
  }
});

test("native and foreign index carriers cannot acquire source-array location capabilities", () => {
  const native = csharpJsArrayElementPolicies[0].select(context({ kind: "array", element }, false));
  assert.equal(native.kind, "resolved");
  assert.equal(native.invocation.indexedLocationMethod, undefined);
  for (const carrier of [undefined, { kind: "target-named", id: "fixture.Foreign" }]) {
    assert.equal(csharpJsArrayElementPolicies[0].select(context(carrier, false)).kind, "rejected");
    assert.equal(csharpJsArrayPropertyPolicies[0].select(context(carrier, false)).kind, "rejected");
  }
});
