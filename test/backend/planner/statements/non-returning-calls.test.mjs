import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { nonReturningCallsSource } from "../../../../../tsonic/test/fixtures/non-returning-calls.mjs";
import { planCsharpDiscardedStatement } from "../../../../dist/backend/planner/statements/statement-output.js";
import { csharpNeverTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

test("non-returning calls preserve native termination, catches and evaluation count", { timeout: 300_000 }, () => {
  for (const surface of [undefined, "js"]) {
    const compiled = compileCsharpSource({ surface, sourceText: nonReturningCallsSource });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.result.diagnostics, []);
    executeCsharpConstruction(compiled, "non-returning-calls", true);
  }
});

test("discarded native bottom values terminate while returning values remain ordinary", () => {
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "fail" }, arguments: [] };
  for (const explicit of [false, true]) {
    const selected = planCsharpDiscardedStatement(expression, csharpNeverTargetType(), explicit);
    assert.equal(selected.kind, "ThrowStatement");
    assert.equal(selected.expression.callee.receiver, expression);
    assert.equal(selected.expression.callee.name, "Value");
    assert.equal(selected.expression.callee.typeArguments.length, 1);
    assert.deepEqual(selected.expression.arguments, []);
    const ordinary = planCsharpDiscardedStatement(expression, csharpSourcePrimitiveTargetType("number"), explicit);
    assert.equal(ordinary.kind, "ExpressionStatement");
    assert.equal(explicit ? ordinary.expression.right : ordinary.expression, expression);
  }
});
