import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpAbsenceReturn, planCsharpVoidReturn } from "../../../../dist/backend/planner/statements/statement-output.js";
import { csharpCarrierAdmitsSourceAbsence, csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpPlannedEffect, csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

// Absence is rendered from the storage's sealed optional representation (records.typeEmission).
const input = { scope: {}, program: { records: { typeEmission: csharpTypeEmissionRecord() } } };

test("absence completion uses the exact native storage without an adapter", () => {
  for (const carrier of [csharpTsValueTargetType(), csharpNullableTargetType(csharpSourcePrimitiveTargetType("uint64"))]) {
    assert.equal(csharpCarrierAdmitsSourceAbsence(carrier), true);
    const returned = planCsharpAbsenceReturn(carrier, input);
    assert.equal(returned.expression.kind, "DefaultExpression");
    const effect = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [] };
    const planned = csharpPlannedEffect(csharpVoidTargetType(), [
      { kind: "ExpressionStatement", expression: effect },
    ]);
    assert.deepEqual(planCsharpVoidReturn(planned, "absence", carrier, input), [
      { kind: "ExpressionStatement", expression: effect }, returned,
    ]);
  }
});

test("absence completion rejects missing or unproved native storage", () => {
  for (const carrier of [undefined, csharpSourcePrimitiveTargetType("uint64"), { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "External.Value" }]) {
    assert.equal(csharpCarrierAdmitsSourceAbsence(carrier), false);
    assert.throws(() => planCsharpAbsenceReturn(carrier, input), /finalized native storage carrier/u);
  }
  assert.throws(() => planCsharpVoidReturn(csharpPlannedValue(csharpSourcePrimitiveTargetType("int32"),
    { kind: "LiteralExpression", value: 1 }), "absence", undefined, input), /finalized native storage carrier/u);
});
