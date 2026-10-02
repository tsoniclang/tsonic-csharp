import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpPresentValueGuard } from "../../../../dist/backend/planner/expressions/optional-storage.js";
import { csharpTsValueTargetType, csharpSourcePrimitiveTargetType, csharpNullableTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpOptionalStorageProjection } from "../../../../dist/target-model/types/projections.js";

test("native optional guards validate their storage-to-present correspondence", () => {
  const value = { kind: "IdentifierName", name: "input" };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const broad = csharpTsValueTargetType();
  const closed = planCsharpPresentValueGuard(broad, broad, value, "present");
  assert.equal(closed.condition.kind, "BinaryExpression");
  assert.equal(closed.condition.right.operand.callee.name, "isUndefined");
  assert.equal(planCsharpPresentValueGuard(broad, integer, value, "present"), undefined);
  const nullable = planCsharpPresentValueGuard(csharpNullableTargetType(integer), integer, value, "present");
  assert.equal(nullable.condition.kind, "IsPatternExpression");
  assert.equal(nullable.condition.type.name, "int");
  assert.equal(planCsharpPresentValueGuard(csharpNullableTargetType(integer), broad, value, "present"), undefined);
  const parameter = { kind: "type-parameter", identity: "Source::Value", name: "Value" };
  const generic = planCsharpPresentValueGuard(csharpOptionalStorageProjection(parameter), parameter, value, "present");
  assert.equal(generic.condition.right.operand.callee.name, "Is1");
  assert.equal(generic.value.callee.name, "As2");
  assert.equal(planCsharpPresentValueGuard(csharpOptionalStorageProjection(parameter), integer, value, "present"), undefined);
});
