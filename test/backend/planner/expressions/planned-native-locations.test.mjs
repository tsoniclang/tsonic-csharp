import assert from "node:assert/strict";
import test from "node:test";
import { captureCsharpPlannedLocation } from "../../../../dist/backend/planner/expressions/planned-locations.js";
import { csharpPlannedValue, sequenceCsharpPlannedValues } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { composeCsharpPlannedCall } from "../../../../dist/backend/planner/expressions/target-members/selected-call/planned-arguments.js";
import { planSelectedCsharpBinaryOperation } from "../../../../dist/backend/planner/expressions/operators/selected-binary.js";
import { tryPlanCsharpTypedLocationOperation } from "../../../../dist/backend/planner/expressions/expression-typed-locations.js";
import { csharpRuntimeLocationTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpVoidTargetType } from "../../../../dist/target-model/types/scalar-types.js";

const integer = { kind: "source-primitive", name: "int32" };
const identifier = name => ({ kind: "IdentifierName", name });
const call = name => ({ kind: "InvocationExpression", callee: identifier(name), arguments: [] });
const effect = name => ({ kind: "ExpressionStatement", expression: call(name) });
const syntaxKinds = ["ParenthesizedExpression"];

function context() {
  let counter = 0;
  const selections = new Map();
  const properties = new Map();
  const ast = { pos: () => 1, text: () => "location", name: () => undefined, hasModifierKind: () => false,
    is: Object.fromEntries(syntaxKinds.map(kind => [`Is${kind}`, node => node.kind === kind])),
    forEachChild: (node, visit) => (node.children ?? []).forEach(visit) };
  const input = { scope: {}, names: { temporaryName: () => `capture${counter++}` },
    program: { source: { ast }, storage: { nativeLocation: node => selections.get(node) },
      sourceNavigation: { expressionEffects: node => ({ suspends: node.suspends === true }) },
      sourceEvidence: { storageTargetType: () => integer }, operations: { property: node => properties.get(node) } } };
  return { input, selections, properties, diagnostics: [] };
}

function location(expression, assignment = "direct", passing = "byref-readwrite") {
  return { kind: "resolved", expression, storageType: integer, assignment, writable: true,
    ...(passing === undefined ? {} : { address: { passing, capturedReferenceCrossesSuspension: false } }) };
}

test("native local location capture retains the cell, not its present value, across suspension", () => {
  const { input, diagnostics } = context();
  const source = {};
  const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, identifier("cell")), location(source), true);
  assert.deepEqual(captured.prelude, []);
  assert.deepEqual(captured.completion.expression, identifier("cell"));
  assert.deepEqual(diagnostics, []);
});

test("a sealed native-backed cell captures its pointer handle rather than rereading a later rebound holder", () => {
  const { input, diagnostics } = context();
  const source = {};
  const fact = { ...location(source), address: undefined, nativeCell: { kind: "local", layout: { pointeeType: integer } } };
  const expression = { kind: "SimpleMemberAccessExpression", receiver: call("handle"), name: "Value" };
  const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, expression), fact, true);
  assert.equal(captured.prelude.length, 1);
  assert.equal(captured.prelude[0].initializer.callee.name, "handle");
  assert.equal(captured.prelude[0].refKind, undefined);
  assert.equal(captured.completion.expression.receiver.name, captured.prelude[0].name);
  assert.deepEqual(diagnostics, []);
});

test("native indexed location snapshots only receiver and indices before later suspension", () => {
  const { input, diagnostics } = context();
  const source = {};
  const selected = { kind: "ElementAccessExpression", receiver: call("owner"), arguments: [call("index")] };
  const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, selected), location(source, "reference-receiver"), true);
  assert.deepEqual(captured.prelude.map(statement => statement.initializer.callee.name), ["owner", "index"]);
  assert.equal(captured.prelude.some(statement => statement.refKind !== undefined), false);
  assert.equal(captured.completion.expression.receiver.name, captured.prelude[0].name);
  assert.equal(captured.completion.expression.arguments[0].name, captured.prelude[1].name);
  assert.deepEqual(diagnostics, []);
});

test("a native struct setter retains the exact receiver cell instead of making a receiver copy", () => {
  const { input, selections, diagnostics } = context();
  const source = {};
  const receiver = {};
  selections.set(receiver, location(receiver));
  const fact = { ...location(source, "unsupported"), address: undefined,
    receiver: { expression: receiver, storageType: integer, address: location(receiver).address } };
  const expression = { kind: "SimpleMemberAccessExpression", receiver: identifier("state"), name: "Value" };
  const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, expression), fact, true);
  assert.deepEqual(captured.prelude, []);
  assert.deepEqual(captured.completion.expression, expression);
  assert.deepEqual(diagnostics, []);
  const missing = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, expression), { ...fact, receiver: undefined }, true);
  assert.equal(missing, undefined);
  assert.match(diagnostics[0].message, /receiver address/u);
});

test("native reference receiver acquisition is once while static member locations need no receiver capture", () => {
  const { input, properties, diagnostics } = context();
  const source = {};
  const expression = { kind: "SimpleMemberAccessExpression", receiver: call("owner"), name: "Value" };
  const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, expression), location(source, "reference-receiver"), true);
  assert.equal(captured.prelude.length, 1);
  assert.equal(captured.prelude[0].initializer.callee.name, "owner");
  properties.set(source, { selection: { kind: "resolved", receiver: { kind: "none" } } });
  const unchanged = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, expression), location(source), false);
  assert.deepEqual(unchanged.prelude, []);
});

test("opaque native references use the existing managed-ref declaration only without suspension", () => {
  for (const passing of ["byref-readwrite", "byref-readonly"]) {
    const { input, diagnostics } = context();
    const source = {};
    const captured = captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, call("reference")), location(source, "direct", passing), false);
    assert.equal(captured.prelude[0].refKind, passing === "byref-readonly" ? "ref-readonly" : "ref");
    assert.equal(captured.prelude[0].initializer.callee.name, "reference");
    assert.equal(captureCsharpPlannedLocation(source, {}, input, diagnostics, csharpPlannedValue(integer, call("reference")), location(source), true), undefined);
    assert.match(diagnostics[0].message, /cannot be held across/u);
  }
});

test("ordinary canonical composition snapshots values and only an exact location hook retains a cell", () => {
  const earlier = csharpPlannedValue(integer, identifier("cell"));
  const later = csharpPlannedValue(integer, identifier("right"), [effect("later")]);
  const captured = sequenceCsharpPlannedValues([earlier, later], () => ({ type: { kind: "PredefinedType", name: "int" }, name: "value" }), values => csharpPlannedValue(integer, values[0]));
  assert.equal(captured.prelude[0].initializer.name, "cell");
  const retained = sequenceCsharpPlannedValues([earlier, later], () => ({ kind: "native-location", expression: identifier("cell") }), values => csharpPlannedValue(integer, values[0]));
  assert.deepEqual(retained.prelude, [effect("later")]);
  assert.equal(retained.completion.expression.name, "cell");
});

test("by-reference arguments preceding suspension capture the owner recipe without reading out storage", () => {
  const { input, diagnostics } = context();
  const source = {};
  const first = { ...csharpPlannedValue(integer, { kind: "ElementAccessExpression", receiver: call("owner"), arguments: [call("index")] }),
    passing: "out", nativeLocation: location(source, "reference-receiver") };
  const second = { ...csharpPlannedValue(integer, identifier("completed"), [effect("suspend")]), suspends: true };
  const planned = composeCsharpPlannedCall(source, {}, input, diagnostics, undefined,
    { operands: [first, second], arguments: values => values.map((expression, index) => ({ kind: "Argument", expression, ...(index === 0 ? { passing: "out" } : {}) })) },
    (_, arguments_) => csharpPlannedValue(integer, { kind: "InvocationExpression", callee: identifier("consume"), arguments: arguments_ }));
  assert.deepEqual(planned.prelude.map(statement => statement.initializer?.callee?.name ?? statement.expression?.callee?.name), ["owner", "index", "suspend"]);
  assert.equal(planned.prelude.some(statement => statement.refKind !== undefined), false);
  assert.equal(planned.completion.expression.arguments[0].passing, "out");
  assert.equal(planned.completion.expression.arguments[0].expression.kind, "ElementAccessExpression");
});

test("compound assignment captures its old value before RHS effects and stores through the same native cell", () => {
  const { input, selections, diagnostics } = context();
  const left = {};
  const right = { suspends: true };
  selections.set(left, location(left, "reference-receiver"));
  input.program.storage.type = () => integer;
  const locationPlan = csharpPlannedValue(integer, { kind: "ElementAccessExpression", receiver: call("owner"), arguments: [call("index")] });
  const rightPlan = csharpPlannedValue(integer, identifier("completed"), [effect("suspend")]);
  const selection = { targetOperation: { kind: "operator", operator: "+=" }, left, right,
    leftInputType: integer, rightInputType: integer, resultType: integer };
  const plan = subject => subject === left ? locationPlan : rightPlan;
  const planned = planSelectedCsharpBinaryOperation({}, selection, {}, input, diagnostics, plan, plan);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned.prelude.slice(0, 2).map(statement => statement.initializer.callee.name), ["owner", "index"]);
  assert.equal(planned.prelude[2].initializer.kind, "ElementAccessExpression");
  assert.equal(planned.prelude[3].expression.callee.name, "suspend");
  assert.deepEqual(planned.prelude.at(-1).expression.left, planned.prelude[2].initializer);
  assert.equal(planned.prelude.at(-2).initializer.operatorToken.kind, "PlusEqualsToken");
});

test("typed ref stores retain original managed storage before a later non-suspending value region", () => {
  const { input, selections, diagnostics } = context();
  const source = {};
  const value = {};
  selections.set(source, location(source));
  input.types = { classifications: { resolveNode: () => csharpVoidTargetType() } };
  input.program.operations.typedLocation = () => ({ kind: "location-store", pointeeType: integer,
    locationType: csharpRuntimeLocationTargetType(integer), location: { kind: "native-ref-return", expression: source }, valueExpression: value });
  const plan = subject => subject === source ? csharpPlannedValue(integer, call("reference"))
    : csharpPlannedValue(integer, identifier("completed"), [effect("valueRegion")]);
  const planned = tryPlanCsharpTypedLocationOperation({}, {}, input, diagnostics, plan, plan).expression;
  assert.deepEqual(diagnostics, []);
  assert.equal(planned.completion.kind, "void");
  assert.equal(planned.prelude[0].refKind, "ref");
  assert.equal(planned.prelude[0].initializer.callee.name, "reference");
  assert.equal(planned.prelude[1].expression.callee.name, "valueRegion");
  assert.equal(planned.prelude[2].expression.left.name, planned.prelude[0].name);
});
