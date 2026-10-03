import assert from "node:assert/strict";
import test from "node:test";
import {
  selectCsharpJsValueCallOperation,
  selectCsharpJsValueBinaryOperation,
  selectCsharpJsValueReceiverOperation,
  validateCsharpJsValueOperationSelection,
} from "../../dist/policy/js-value-operations/selection.js";
import { csharpTsValueTargetType } from "../../dist/policy/types/index.js";

const carrier = csharpTsValueTargetType();
const policy = { types: { resolveNode: () => carrier } };

test("optional closed reads select exact immutable eager counterparts", () => {
  for (const [source, expected] of [["property-read", "ReadDynamicSlot"], ["element-read", "ReadDynamicElement"]]) {
    const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverOperation(carrier, source, true));
    assert.equal(selected.kind, "resolved");
    assert.deepEqual(selected.presentOperation, { runtimeMember: expected, dispatch: "instance", resultType: carrier });
    assert.equal(selected.receiverReadOperation, undefined);
    assert.equal(Object.isFrozen(selected), true);
    assert.equal(Object.isFrozen(selected.presentOperation), true);
  }
});

test("closed calls select callee acquisition separately from argument evaluation", () => {
  for (const [kind, read] of [["direct", undefined], ["property", "ReadDynamicSlot"], ["element", "ReadDynamicElement"]]) {
    for (const optional of [false, true]) {
      const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueCallOperation(policy, {}, {}, {}, kind, optional));
      assert.equal(selected.kind, "resolved");
      assert.equal(selected.presentOperation.runtimeMember, kind === "direct" ? "InvokeDynamic" : "InvokeDynamicWithThis");
      assert.equal(selected.receiverReadOperation?.runtimeMember, read);
    }
  }
});

test("optional closed operation evidence fails closed on missing or mismatched correspondence", () => {
  const selected = selectCsharpJsValueReceiverOperation(carrier, "element-read", true);
  const mutations = [
    { presentOperation: undefined },
    { presentOperation: { ...selected.presentOperation, runtimeMember: "ReadDynamicSlot" } },
    { presentOperation: { ...selected.presentOperation, dispatch: "static" } },
    { presentOperation: { ...selected.presentOperation, resultType: { kind: "source-primitive", name: "uint64" } } },
    { receiverReadOperation: selected.presentOperation },
    { dispatch: "static" },
  ];
  for (const mutation of mutations) assert.equal(validateCsharpJsValueOperationSelection({ ...selected, ...mutation }).kind, "rejected");
  const call = selectCsharpJsValueCallOperation(policy, {}, {}, {}, "property", true);
  for (const mutation of [
    { receiverReadOperation: undefined },
    { receiverReadOperation: { ...call.receiverReadOperation, runtimeMember: "ReadDynamicElement" } },
    { presentOperation: undefined },
  ]) assert.equal(validateCsharpJsValueOperationSelection({ ...call, ...mutation }).kind, "rejected");
});

test("ordinary reads retain their direct native invocation and no speculative optional facts", () => {
  const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueReceiverOperation(carrier, "element-read", false));
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.runtimeMember, "ReadDynamicElement");
  assert.equal(selected.presentOperation, undefined);
  assert.equal(selected.receiverReadOperation, undefined);
  assert.equal(selectCsharpJsValueReceiverOperation(carrier, "element-write", true).kind, "rejected");
});

test("logical JS selections contain exact native condition and branch relation", () => {
  const policy = { types: { resolveNode: () => carrier, resolveReadStorage: () => undefined } };
  for (const [operator, member, dispatch, whenTrue] of [
    ["&&", "ToDynamicBoolean", "static", "right"],
    ["||", "ToDynamicBoolean", "static", "left"],
    ["??", "isUndefined", "instance", "right"],
  ]) {
    const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(policy, {}, {}, {}, operator));
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.shortCircuit.condition.runtimeMember, member);
    assert.equal(selected.shortCircuit.condition.dispatch, dispatch);
    assert.equal(selected.shortCircuit.whenTrue, whenTrue);
    assert.equal(Object.isFrozen(selected.shortCircuit.condition), true);
    assert.equal(validateCsharpJsValueOperationSelection({ ...selected, shortCircuit: undefined }).kind, "rejected");
    assert.equal(validateCsharpJsValueOperationSelection({ ...selected, shortCircuit: { ...selected.shortCircuit,
      condition: { ...selected.shortCircuit.condition, resultType: carrier } } }).kind, "rejected");
  }
});
