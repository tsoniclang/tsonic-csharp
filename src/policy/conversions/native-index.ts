import type { SourceDescriptorView, SourceValueOperand } from "@tsonic/target-api/source";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpNativeIntegerUse } from "../../target-model/conversions/native-indices.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpResolvedBinaryOperation } from "../../target-model/records/operations/operator-selection.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";

const shifts = new Set(["<<", ">>", ">>>", "<<=", ">>=", ">>>="]);

export function csharpNativeShiftCountType(operation: CsharpResolvedBinaryOperation): TargetTypeRef | undefined {
  if (!shifts.has(operation.sourceOperator)) return operation.rightInputType;
  if (operation.rightInputType === undefined) throw new TypeError("A selected Native shift requires its actual right operand carrier.");
  return operation.rightInputType.kind === "source-primitive" && operation.rightInputType.name === "int64"
    ? csharpSourcePrimitiveTargetType("int32") : operation.rightInputType;
}

export function selectCsharpNativeIndexConversion(view: SourceDescriptorView, operand: SourceValueOperand,
  use: CsharpNativeIntegerUse, source: TargetTypeRef, target: TargetTypeRef): CsharpConversionSelection | undefined {
  view.assertEvidence(operand.value);
  if (operand.value.type.kind !== "primitive" || operand.value.type.primitive !== "int64" ||
    source.kind !== "source-primitive" || source.name !== "int64" || target.kind !== "source-primitive" || target.name !== "int32") return undefined;
  const occurrence = use.kind === "shift-count" ? use.operation.right : use.occurrence;
  const indexType = use.kind === "shift-count" ? shifts.has(use.operation.sourceOperator)
    ? csharpNativeShiftCountType(use.operation) : undefined : use.type;
  if (operand.occurrence !== occurrence || indexType === undefined || !targetTypeRefEquals(indexType, target) ||
    use.kind !== "shift-count" && use.passingMode !== "by-value") return undefined;
  return Object.freeze({ kind: "checked-native-integer" });
}
