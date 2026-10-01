import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpAbsenceReturn, planCsharpVoidReturn } from "../../../../dist/backend/planner/statements/statement-output.js";
import { csharpCarrierAdmitsSourceAbsence, csharpTsValueTargetType } from "../../../../dist/target-model/types/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";

test("absence completion uses the exact native storage without an adapter", () => {
  for (const carrier of [csharpTsValueTargetType(), csharpNullableTargetType(csharpSourcePrimitiveTargetType("uint64"))]) {
    assert.equal(csharpCarrierAdmitsSourceAbsence(carrier), true);
    const returned = planCsharpAbsenceReturn(carrier);
    assert.equal(returned.expression.kind, "DefaultExpression");
    const effect = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [] };
    assert.deepEqual(planCsharpVoidReturn(effect, "absence", carrier), [
      { kind: "ExpressionStatement", expression: effect }, returned,
    ]);
  }
});

test("absence completion rejects missing or unproved native storage", () => {
  for (const carrier of [undefined, csharpSourcePrimitiveTargetType("uint64"), { kind: "target-named", id: "External.Value" }]) {
    assert.equal(csharpCarrierAdmitsSourceAbsence(carrier), false);
    assert.throws(() => planCsharpAbsenceReturn(carrier), /finalized native storage carrier/u);
  }
  assert.throws(() => planCsharpVoidReturn({ kind: "LiteralExpression", value: 1 }, "absence"), /finalized native storage carrier/u);
});
