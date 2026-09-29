import assert from "node:assert/strict";
import test from "node:test";
import { getCsharpTypeofResult } from "../../dist/target-model/types/runtime-kind.js";
import { csharpNullableTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../dist/target-model/types/index.js";
import { planCsharpRuntimeCategory } from "../../dist/backend/planner/expressions/runtime-category.js";
import { createDestructuringPlannerState } from "../../dist/backend/planner/bindings/binding-state.js";

test("optional runtime categories preserve their exact present kind and reject forged nested facts", () => {
  for (const [value, kind] of [[csharpStringTargetType(), "string"], [csharpSourcePrimitiveTargetType("uint64"), "bigint"]]) {
    const sourceCarrier = csharpNullableTargetType(value);
    const selected = getCsharpTypeofResult(sourceCarrier);
    assert.deepEqual(selected, { kind: "optional", sourceCarrier, element: value, value: kind });
    const context = { scope: {} };
    const input = { kind: "IdentifierName", name: "value" };
    const state = createDestructuringPlannerState();
    const planned = planCsharpRuntimeCategory(input, sourceCarrier, selected, context, state);
    assert.deepEqual(planned.expression, input);
    assert.deepEqual(planned.arms[0].expression, { kind: "LiteralExpression", value: "object" });
    assert.deepEqual(planned.arms[1].expression, { kind: "LiteralExpression", value: kind });
    assert.equal(planCsharpRuntimeCategory(input, sourceCarrier, { ...selected, value: "boolean" }, context, state), undefined);
    assert.equal(planCsharpRuntimeCategory(input, sourceCarrier, { ...selected, sourceCarrier: value }, context, state), undefined);
  }
});
