import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpEmittedExpressions } from "../../../dist/analysis/operations/emitted-expressions.js";

function select(nodes, admitted, properties, elements = new Map(), calls = new Map()) {
  return selectCsharpEmittedExpressions({
    ast: { is: { IsForOfStatement: () => false } },
    nodes,
    admitted: node => admitted.has(node),
    operations: {
      nativeHandler: { get: () => undefined },
      selectedCall: { get: node => calls.get(node) },
      selectedProperty: { get: node => properties.get(node) },
      selectedElement: { get: node => elements.get(node) },
    },
    evidence: { sourceDefaultValue: { get: () => undefined }, sourceArgument: { get: () => undefined } },
    jsCalls: { jsCall: { get: () => undefined } },
  });
}

test("source member reference admission includes the actual selected receiver, not a guessed operand", () => {
  const member = {};
  const receiver = {};
  const unrelated = {};
  const selected = select([member, receiver, unrelated], new Set([member]), new Map([
    [member, { selection: { kind: "source-owned", source: { receiver: { expression: receiver } } } }],
  ]));
  assert.equal(selected.has(member), true, "the original demanded source member is retained");
  assert.equal(selected.has(receiver), true, "its exact selected receiver participates in identifier admission");
  assert.equal(selected.has(unrelated), false, "an unrelated source value is not manufactured as a receiver");
  assert.equal(selected.size, 2, "the one actual receiver is admitted once");
});

test("selected receiver chains close over non-root source members without duplicating shared receivers", () => {
  const first = {};
  const second = {};
  const middle = {};
  const receiver = {};
  const selected = select([first, second, middle, receiver], new Set([first, second]), new Map([
    [first, { selection: { kind: "source-owned", source: { receiver: { expression: middle } } } }],
    [second, { selection: { kind: "source-owned", source: { receiver: { expression: middle } } } }],
    [middle, { selection: { kind: "source-owned", source: { receiver: { expression: receiver } } } }],
  ]));
  assert.equal(selected.has(middle) && selected.has(receiver), true, "the complete actual receiver chain is admitted");
  assert.equal(selected.size, 4, "shared receiver identities are visited once");
});

test("source element reference admission uses its selected receiver record", () => {
  const element = {};
  const receiver = {};
  const selected = select([element, receiver], new Set([element]), new Map(), new Map([
    [element, { target: { kind: "source-owned", source: { receiver: { expression: receiver } } } }],
  ]));
  assert.equal(selected.has(receiver), true, "the exact selected element receiver is admitted");
  assert.equal(selected.size, 2, "no unselected value joins the element input");
});

test("resolved native members do not invent a runtime provider receiver", () => {
  const member = {};
  const receiver = {};
  const selected = select([member, receiver], new Set([member]), new Map([
    [member, { selection: { kind: "resolved", receiver: { kind: "none" } } }],
  ]));
  assert.equal(selected.has(receiver), false, "a native type owner is not an emitted source value");
  assert.equal(selected.size, 1, "the selected native member contract alone determines its operands");
});

test("a member's discovered call receiver closes its source callee and original receiver dependencies", () => {
  const member = {};
  const call = {};
  const callee = {};
  const receiver = {};
  const properties = new Map([
    [member, { selection: { kind: "source-owned", source: { receiver: { expression: call } } } }],
    [callee, { selection: { kind: "source-owned", source: { receiver: { expression: receiver } } } }],
  ]);
  const calls = new Map([[call, { source: { sourceCallee: { expression: callee } },
    target: { kind: "source-owned" }, unionCall: { kind: "not-union" }, form: { kind: "target" } }]]);
  const selected = select([member, call, callee, receiver], new Set([member]), properties, new Map(), calls);
  assert.equal(selected.has(call) && selected.has(callee) && selected.has(receiver), true,
    "a late discovered receiver call uses the same complete native dependency authority");
  assert.equal(selected.size, 4, "each actual runtime dependency participates exactly once");
  calls.set(call, { ...calls.get(call), target: { kind: "resolved" } });
  const native = select([member, call, callee, receiver], new Set([member]), properties, new Map(), calls);
  assert.equal(native.has(call) && !native.has(callee) && !native.has(receiver), true,
    "a native-dispatched call still does not publish its unplanned source callee or guessed receiver");
});
