import assert from "node:assert/strict";
import test from "node:test";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { planCsharpObjectInitialization } from "../../../../dist/backend/planner/expressions/planned-initializers.js";
import { completeCsharpClassInitializationRegion } from "../../../../dist/backend/planner/declarations/classes/initializers.js";
import { planCsharpConstructorInitializerArgument } from "../../../../dist/backend/planner/declarations/classes/initializer-arguments.js";
import { csharpSourcePrimitiveTargetType, csharpNeverTargetType, csharpTargetNamedType, csharpNullableTargetType } from "../../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("uint64");
const carrier = csharpTargetNamedType("fixture:Record", [], { kind: "named", name: "Record" });
const type = { kind: "IdentifierName", name: "Record" };
const identifier = name => ({ kind: "IdentifierName", name });
const call = name => ({ kind: "InvocationExpression", callee: identifier(name), arguments: [] });
const effect = name => ({ kind: "ExpressionStatement", expression: call(name) });
const value = name => csharpPlannedValue(integer, call(name));
const group = (name, planned) => ({ value: planned, presence: { kind: "required" }, assignments: expression => [{ kind: "AssignmentExpression", name, carrier: integer, expression }] });
function context() {
  let index = 0;
  return { program: { source: { ast: { pos: () => 1, end: () => 9, parent: () => undefined } } },
    scope: { generatedMethods: new Map() }, names: { temporaryName: name => `${name}_${index++}` } };
}

test("native object pure initialization remains one direct constructor without a spill", () => {
  const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [group("left", value("left")), group("right", value("right"))]);
  assert.deepEqual(planned.prelude, []);
  assert.equal(planned.completion.expression.kind, "ObjectCreationExpression");
  assert.deepEqual(planned.completion.expression.assignments.map(assignment => assignment.expression.callee.name), ["left", "right"]);
});

test("native object initialization preserves overwritten values and orders a later region after earlier stores", () => {
  const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [group("same", value("first")),
    group("same", csharpPlannedValue(integer, identifier("completed"), [effect("complete")])), group("last", value("last"))]);
  assert.deepEqual(planned.prelude.map(statement => statement.kind), ["LocalDeclarationStatement", "ExpressionStatement", "ExpressionStatement", "LocalDeclarationStatement"]);
  assert.equal(planned.prelude[0].initializer.callee.name, "first");
  assert.equal(planned.prelude[1].expression.callee.name, "complete");
  assert.equal(planned.prelude[2].expression.left.name, planned.prelude[0].name);
  assert.equal(planned.prelude[3].initializer.callee.name, "last");
  assert.deepEqual(planned.completion.expression.assignments.map(assignment => assignment.name), ["same", "last"]);
  assert.equal(planned.prelude.some(statement => statement.initializer?.kind === "ObjectCreationExpression"), false);
});

test("one spread orders an overwritten getter before a newly declared field", () => {
  const spread = { value: csharpPlannedValue(carrier, call("source")), presence: { kind: "required" },
    assignments: receiver => ["same", "next"].map(name => ({ kind: "AssignmentExpression", name,
      carrier: integer, expression: { kind: "SimpleMemberAccessExpression", receiver, name } })) };
  const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [],
    [group("same", value("first")), spread]);
  assert.ok(planned);
  assert.deepEqual(planned.prelude.map(statement => statement.kind),
    ["LocalDeclarationStatement", "LocalDeclarationStatement", "ExpressionStatement", "LocalDeclarationStatement"]);
  assert.equal(planned.prelude[2].expression.right.name, "same");
  assert.equal(planned.prelude[3].initializer.name, "next");
  assert.equal(planned.prelude[2].expression.right.receiver.name, planned.prelude[1].name);
  assert.equal(planned.prelude[3].initializer.receiver.name, planned.prelude[1].name);
});

test("object spreads capture their exact source once even for zero or multiple projected fields", () => {
  for (const count of [0, 2]) {
    const spread = { value: csharpPlannedValue(carrier, call("source")), presence: { kind: "required" }, assignments: receiver => Array.from({ length: count }, (_, index) => ({
      kind: "AssignmentExpression", name: `field${index}`, carrier: integer, expression: { kind: "SimpleMemberAccessExpression", receiver, name: `field${index}` },
    })) };
    const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [spread]);
    assert.equal(planned.prelude[0].initializer.callee.name, "source");
    assert.equal(planned.prelude.length, count + 1);
    for (const statement of planned.prelude.slice(1)) assert.equal(statement.initializer.receiver.name, planned.prelude[0].name);
    assert.equal(planned.completion.expression.assignments.length, count);
  }
});

test("optional spreads evaluate once and guard their complete ordered assignment region", () => {
  const source = csharpNullableTargetType(carrier);
  const spread = { value: csharpPlannedValue(source, call("source")), presence: { kind: "optional", carrier },
    assignments: receiver => ["left", "right"].map(name => ({ kind: "AssignmentExpression", name,
      carrier: csharpNullableTargetType(integer), expression: { kind: "SimpleMemberAccessExpression", receiver, name } })) };
  const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [spread]);
  assert.ok(planned);
  assert.deepEqual(planned.prelude.map(statement => statement.kind),
    ["LocalDeclarationStatement", "LocalDeclarationStatement", "LocalDeclarationStatement", "IfStatement"]);
  assert.equal(planned.prelude[0].initializer.callee.name, "source");
  const guard = planned.prelude[3];
  assert.equal(guard.thenBody.statements.length, 2);
  assert.equal(guard.condition.kind, "IsPatternExpression");
  assert.equal(guard.thenBody.statements.every(statement =>
    statement.expression.right.receiver.name === guard.condition.designation), true);
  assert.equal(planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [],
    [{ ...spread, presence: { kind: "optional", carrier: integer } }]) === undefined, true);
});

test("optional contributions cannot invent required values, but later definite stores complete construction", () => {
  const spread = { value: csharpPlannedValue(csharpNullableTargetType(carrier), call("source")),
    presence: { kind: "optional", carrier }, assignments: receiver => [{ kind: "AssignmentExpression", name: "value",
      carrier: integer, expression: { kind: "SimpleMemberAccessExpression", receiver, name: "value" } }] };
  assert.equal(planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [spread]) === undefined, true);
  const planned = planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [spread, group("value", value("final"))]);
  assert.ok(planned);
  assert.equal(planned.prelude[1].initializer, undefined);
  assert.equal(planned.prelude[2].kind, "IfStatement");
  assert.equal(planned.prelude[3].expression.right.callee.name, "final");
  assert.equal(planned.completion.expression.assignments[0].expression.name, planned.prelude[1].name);
  const conflicting = { ...spread, assignments: receiver => [{ ...spread.assignments(receiver)[0], carrier }] };
  assert.equal(planCsharpObjectInitialization({}, {}, context(), [], carrier, type, [], [group("value", value("first")), conflicting]) === undefined, true);
});

test("ordered instance and static initialization regions keep all necessary neighboring fields in source order", () => {
  for (const receiver of ["this", "User"]) {
    const entries = [{ node: {}, name: "first", value: value("first") }, { node: {}, statements: [effect("staticBlock")] },
      { node: {}, name: "second", value: csharpPlannedValue(integer, identifier("result"), [effect("complete")]) },
      { node: {}, name: "third", value: value("third") }];
    const region = completeCsharpClassInitializationRegion(entries, true, receiver);
    assert.equal(region.inline.size, 0);
    assert.deepEqual(region.statements.map(statement => statement.expression.right?.callee?.name ?? statement.expression.callee?.name ?? statement.expression.right?.name),
      ["first", "staticBlock", "complete", "result", "third"]);
    for (const statement of region.statements.filter(statement => statement.expression.kind === "AssignmentExpression"))
      assert.equal(statement.expression.left.receiver.name, receiver);
  }
});

test("direct class initialization retains source-node identities and terminating initialization excludes later stores", () => {
  const source = {};
  const direct = completeCsharpClassInitializationRegion([{ node: source, name: "value", value: value("value") }], false, "this");
  assert.equal(direct.inline.get(source).callee.name, "value");
  assert.deepEqual(direct.statements, []);
  const stopped = completeCsharpClassInitializationRegion([{ node: source, name: "first", value: value("first") },
    { node: {}, name: "stop", value: csharpPlannedEffect(csharpNeverTargetType(), [{ kind: "ThrowStatement", expression: identifier("failure") }]) },
    { node: {}, name: "last", value: value("forbidden") }], true, "this");
  assert.equal(stopped.statements.length, 2);
  assert.equal(stopped.statements[1].kind, "ThrowStatement");
});

test("base initializer sequencing uses one exact static method and direct native parameter references", () => {
  const input = context();
  const node = {};
  const planned = csharpPlannedValue(integer, identifier("value"), [effect("before")]);
  const argument = planCsharpConstructorInitializerArgument(node, planned, [{ name: "value", type: { kind: "PredefinedType", name: "ulong" } }], input, []);
  const helper = input.scope.generatedMethods.get(node);
  assert.deepEqual(helper.modifiers, ["private", "static"]);
  assert.equal(helper.returnType.name, "ulong");
  assert.equal(helper.parameters[0].passing, "ref");
  assert.deepEqual(helper.body.statements.map(statement => statement.kind), ["ExpressionStatement", "ReturnStatement"]);
  assert.equal(argument.expression.arguments[0].passing, "ref");
  assert.equal(argument.expression.arguments[0].expression.name, "value");
  assert.doesNotMatch(JSON.stringify(helper), /LambdaExpression|ObjectCreationExpression|ContinueWith|Task/);
  const direct = planCsharpConstructorInitializerArgument({}, value("direct"), [], input, []);
  assert.equal(direct.expression.callee.name, "direct");
  assert.equal(input.scope.generatedMethods.size, 1);
});
