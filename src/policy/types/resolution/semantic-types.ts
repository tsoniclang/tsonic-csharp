import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSemanticCarrierInput } from "../../model/semantic-types.js";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpVoidTargetType } from "../../../target-model/types/index.js";

export function selectCsharpSemanticCarrier(input: CsharpSemanticCarrierInput): TargetTypeRef | undefined {
  if (input.intrinsic === "any" || input.intrinsic === "unknown") return undefined;
  const intrinsic: Partial<Record<CsharpSemanticCarrierInput["intrinsic"], TargetTypeRef>> = {
    boolean: csharpSourcePrimitiveTargetType("bool"), number: csharpSourcePrimitiveTargetType("float64"),
    string: csharpStringTargetType(), bigint: csharpBigIntegerTargetType(), void: csharpVoidTargetType(),
  };
  return input.typeParameter ?? input.targetType ?? intrinsic[input.intrinsic];
}
