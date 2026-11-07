import { selectCsharpFlowReadConversion } from "../../conversions/expression.js";
import type { CsharpFlowReadProjection, CsharpValueRefinementClassification } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function selectCsharpFlowReadProjection(
  policy: Parameters<typeof selectCsharpFlowReadConversion>[0],
  storageType: TargetTypeRef | undefined,
  selectedType: TargetTypeRef | undefined,
  refinement: CsharpValueRefinementClassification | undefined,
  deferredConstructorField: boolean,
  selectedThrowable: boolean,
  hostRead: Parameters<typeof selectCsharpFlowReadConversion>[4],
): CsharpFlowReadProjection {
  if (storageType === undefined) return { kind: "identity" };
  if (storageType.kind === "type-parameter" && selectedType !== undefined &&
      targetTypeRefEquals(storageType, selectedType) && deferredConstructorField) return { kind: "non-null" };
  if (refinement === undefined) return { kind: "rejected",
    reason: "C# analysis received a source value without finalized refinement evidence." };
  if (refinement.kind !== "resolved") {
    if (selectedType === undefined || targetTypeRefEquals(storageType, selectedType)) return { kind: "identity" };
    return { kind: "rejected", reason: "A target storage-read projection requires its exact Source publication." };
  }
  if (refinement.exact && (refinement.flowReadTargetType === undefined ||
      targetTypeRefEquals(storageType, refinement.flowReadTargetType))) return { kind: "identity" };
  if (storageType.kind === "target-named" &&
      (storageType as CsharpTargetNamedTypeRef).csharpFlowRefinementRepresentation === "identity") return { kind: "identity" };
  const target = refinement.flowReadTargetType;
  if (target === undefined) return { kind: "rejected",
    reason: "The exact checked source value refinement has no closed C# representation." };
  if (targetTypeRefEquals(storageType, target)) return { kind: "identity" };
  const selection = selectCsharpFlowReadConversion(policy, storageType, target, selectedThrowable, hostRead);
  return selection.kind === "rejected" ? selection : { kind: "conversion", source: storageType, target, selection };
}
