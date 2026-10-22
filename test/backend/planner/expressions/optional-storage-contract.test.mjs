import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpPresentValueGuard } from "../../../../dist/backend/planner/expressions/optional-storage.js";
import { csharpTsValueTargetType, csharpSourcePrimitiveTargetType, csharpNullableTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpOptionalStorageProjection } from "../../../../dist/target-model/types/projections.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

// The planner reads each storage's optional representation from the sealed type emission record.
const input = { scope: {}, program: { records: { typeEmission: csharpTypeEmissionRecord() } } };

test("native optional guards bind the present value their sealed storage selects", () => {
  const value = { kind: "IdentifierName", name: "input" };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const broad = csharpTsValueTargetType();
  const closed = planCsharpPresentValueGuard(broad, broad, value, "present", input);
  assert.equal(closed.condition.kind, "BinaryExpression");
  assert.equal(closed.condition.right.operand.callee.name, "isUndefined");
  const nullable = planCsharpPresentValueGuard(csharpNullableTargetType(integer), integer, value, "present", input);
  assert.equal(nullable.condition.kind, "IsPatternExpression");
  assert.equal(nullable.condition.type.name, "int");
  // The present carrier is the storage's own (records.typeEmission optionalStorage.present): a caller's different
  // present carrier cannot change the bound payload type.
  assert.deepEqual(planCsharpPresentValueGuard(csharpNullableTargetType(integer), broad, value, "present", input), nullable);
  const parameter = { kind: "type-parameter", identity: "Source::Value", name: "Value" };
  const generic = planCsharpPresentValueGuard(csharpOptionalStorageProjection(parameter), parameter, value, "present", input);
  assert.equal(generic.condition.right.operand.callee.name, "Is1");
  assert.equal(generic.value.callee.name, "As2");
  assert.deepEqual(planCsharpPresentValueGuard(csharpOptionalStorageProjection(parameter), integer, value, "present", input), generic);
});
