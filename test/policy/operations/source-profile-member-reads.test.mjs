import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsArrayElementPolicies, csharpJsArrayPropertyPolicies } from "../../../dist/policy/operations/source-profiles/js/arrays.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpSourceProfileInputs, unrepresentedCsharpCarrier } from "../../helpers/planning-records.mjs";

const element = { kind: "source-primitive", name: "int64" };
const receiver = csharpJsArrayTargetType(element);

function context(carrier, readonly, indexType = { kind: "source-primitive", name: "int32" }) {
  const source = { expression: {}, selection: { access: readonly ? "read" : "read-write" }, access: { access: readonly ? "read" : "read-write", readonly },
    receiver: { expression: {}, type: { kind: "array", readonly, element: { kind: "primitive", primitive: "int64" } } },
    argument: { expression: {}, type: { kind: "primitive", primitive: "int32" } } };
  const host = { types: { value: node => (node === source.receiver.expression ? carrier
    : node === source.argument.expression ? indexType : undefined) ?? unrepresentedCsharpCarrier(node) } };
  // The member policies read the receiver carrier from the input facts the analysis resolves for the access.
  return { host, source, receiverType: carrier, readonly,
    inputs: csharpSourceProfileInputs(host, { operation: source.expression, values: [source.receiver, source.argument] }) };
}

test("synthesized array contributors retain one native member policy and Host-selected writability", () => {
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
  for (const carrier of [undefined, { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Foreign" }]) {
    assert.equal(csharpJsArrayElementPolicies[0].select(context(carrier, false)).kind, "rejected");
    assert.equal(csharpJsArrayPropertyPolicies[0].select(context(carrier, false)).kind, "rejected");
  }
});

test("array indices consume the published integral or genuine numeric-property carrier without floating native indices", () => {
  for (const kind of ["int8", "uint8", "int16", "uint16", "int32", "int64", "uint64", "native-int", "int128"]) {
    const selected = csharpJsArrayElementPolicies[0].select(context(receiver, false, { kind: "source-primitive", name: kind }));
    assert.equal(selected.kind, "resolved", kind);
    assert.deepEqual(selected.targetMember.parameters[0].type, { kind: "source-primitive", name: "int32" }, kind);
    assert.equal(selected.invocation.indexedLocationMethod, "elementLocation", kind);
  }
  for (const kind of ["float32", "float64"]) {
    const selected = csharpJsArrayElementPolicies[0].select(context(receiver, false, { kind: "source-primitive", name: kind }));
    assert.equal(selected.kind, "resolved", kind);
    assert.deepEqual(selected.targetMember.parameters[0].type, { kind: "source-primitive", name: "float64" }, kind);
    assert.equal(selected.invocation.indexedLocationMethod, "numericPropertyLocation", kind);
  }
  for (const index of [undefined, { kind: "source-primitive", name: "decimal" }, { kind: "source-primitive", name: "bool" }]) {
    const input = context(receiver, false, index);
    if (index === undefined) input.inputs = { ...input.inputs, values: { get: node => node === input.source.receiver.expression ? receiver : undefined } };
    assert.equal(csharpJsArrayElementPolicies[0].select(input).kind, "rejected", index?.name ?? "missing publication");
  }
});
