import assert from "node:assert/strict";
import test from "node:test";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../../dist/target-model/types/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";
import { csharpPlannedValue, csharpPlannedExpressionIsStable } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { planCsharpPlannedDiscard, planCsharpDiscardedStatement, planDiscardedExpression } from "../../../../dist/backend/planner/statements/statement-output.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const invocation = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "effect" }, arguments: [] };
const prelude = { kind: "ExpressionStatement", expression: invocation };

for (const asynchronous of [false, true]) {
  const carrier = csharpDelegateTargetType("System.Func", [], asynchronous ? csharpTaskTargetType(integer) : integer);
  const definition = { kind: "LambdaExpression", ...(asynchronous ? { async: true } : {}), parameters: [], body: invocation };
  for (const explicit of [false, true]) {
    test(`discarding an uninvoked ${asynchronous ? "async" : "sync"} definition retains only prior effects (${explicit ? "explicit" : "implicit"})`, () => {
      const parenthesized = { kind: "ParenthesizedExpression", expression: { kind: "ParenthesizedExpression", expression: definition } };
      for (const expression of [definition, parenthesized]) {
        const discarded = planCsharpPlannedDiscard(csharpPlannedValue(carrier, expression, [prelude]), explicit);
        assert.equal(discarded.length === 1 && discarded[0] === prelude, true, "definition bodies do not execute and prior effects are preserved exactly");
        assert.equal(planCsharpDiscardedStatement(expression, carrier, explicit) === undefined, true, "pure definition has no native statement");
        assert.equal(planDiscardedExpression(expression, carrier) === undefined, true, "pure definition has no native discarded expression");
        assert.equal(csharpPlannedExpressionIsStable(expression), false, "discard elision does not change value sequencing or observable closure identity");
      }
    });
  }
}

test("discarding calls and getter reads must still evaluate their effects", () => {
  const getter = { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "source" }, name: "callback" };
  const delegate = csharpDelegateTargetType("System.Func", [], integer);
  for (const [expression, carrier] of [[invocation, integer], [getter, delegate], [invocation, csharpTaskTargetType(integer)]]) {
    const statements = planCsharpPlannedDiscard(csharpPlannedValue(carrier, expression, [prelude]));
    assert.equal(statements.length === 2 && statements[0] === prelude, true, "effects retain their evaluation order");
    const selected = statements[1].expression;
    assert.equal(selected === expression || selected.kind === "AssignmentExpression" && selected.right === expression, true, "native evaluation is not erased");
  }
});
