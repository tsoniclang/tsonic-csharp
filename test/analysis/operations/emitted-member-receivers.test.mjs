import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpEmittedExpressions } from "../../../dist/analysis/operations/emitted-expressions.js";

function select(nodes, admitted, properties, elements = new Map(), calls = new Map(), modules = new Map(), receivers = new Map()) {
  return selectCsharpEmittedExpressions({
    ast: { is: { IsForOfStatement: () => false } },
    nodes,
    admitted: node => admitted.has(node),
    modules: { get: node => modules.get(node) },
    receivers: { get: node => receivers.get(node) },
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

test("selected source module members do not emit a namespace object as a runtime receiver", () => {
  const member = {};
  const namespace = {};
  const selected = select([member, namespace], new Set([member]), new Map([
    [member, { selection: { kind: "source-owned", source: { receiver: { expression: namespace } } } }],
  ]), new Map(), new Map(), new Map([[member, { declaration: {} }]]));
  assert.equal(selected.has(member), true, "the checked member remains an emitted exact module reference");
  assert.equal(selected.has(namespace), false, "its sealed module owner is rendered directly, not evaluated as a runtime object");
  assert.equal(selected.size, 1, "module-static dispatch adds no invented receiver dependency");
});

test("sealed native type receivers do not acquire their namespace as a runtime property or element operand", () => {
  const property = {};
  const element = {};
  const qualifier = {};
  const namespace = {};
  const declarations = new Map([[qualifier, { kind: "type", reference: qualifier }]]);
  const properties = new Map([
    [property, { selection: { kind: "source-owned", source: { receiver: { expression: qualifier } } } }],
    [qualifier, { selection: { kind: "source-owned", source: { receiver: { expression: namespace } } } }],
  ]);
  const elements = new Map([[element, { target: { kind: "source-owned", source: { receiver: { expression: qualifier } } } }]]);
  const selected = select([property, element, qualifier, namespace], new Set([property, element]), properties, elements,
    new Map(), new Map(), declarations);
  assert.equal(selected.has(property) && selected.has(element), true, "both original static member operations remain demanded");
  assert.equal(selected.has(qualifier) || selected.has(namespace), false, "type qualification evaluates neither a type value nor its namespace");
  assert.equal(selected.size, 2, "one canonical type classification closes both native member forms");
  declarations.set(qualifier, { kind: "value" });
  const runtime = select([property, element, qualifier, namespace], new Set([property, element]), properties, elements,
    new Map(), new Map(), declarations);
  assert.equal(runtime.has(qualifier) && runtime.has(namespace), true, "actual runtime receivers retain their complete dependency chain");
  assert.equal(runtime.size, 4, "no runtime effect is dropped because its source also names a type");
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
