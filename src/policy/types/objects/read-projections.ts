import { selectCsharpFlowReadConversion } from "../../conversions/expression.js";
import type { CsharpFlowReadProjection, CsharpValueRefinementClassification } from "../../../target-model/records/source-evidence.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function selectCsharpFlowReadProjection(
  policy: Parameters<typeof selectCsharpFlowReadConversion>[0],
  storageType: TargetTypeRef | undefined,
  selectedType: TargetTypeRef | undefined,
  refinement: CsharpValueRefinementClassification | undefined,
  deferredConstructorField: boolean,
): CsharpFlowReadProjection {
  if (storageType === undefined) return { kind: "identity" };
  if (storageType.kind === "type-parameter" && selectedType !== undefined &&
      targetTypeRefEquals(storageType, selectedType) && deferredConstructorField) return { kind: "non-null" };
  if (refinement === undefined) return { kind: "rejected",
    reason: "C# analysis received a source value without finalized refinement evidence." };
  const source = refinement.source;
  if (source.kind !== "resolved") {
    if (selectedType === undefined || targetTypeRefEquals(storageType, selectedType)) return { kind: "identity" };
    return { kind: "rejected", reason: source.kind === "not-project-reference"
      ? "A target storage-read projection requires an exact project source declaration."
      : `A target storage-read projection requires the exact source ${source.missing === "declared-type" ? "declared type" : "selected type"}.` };
  }
  if (source.refinement.kind === "exact" && (refinement.flowReadTargetType === undefined ||
      targetTypeRefEquals(storageType, refinement.flowReadTargetType))) return { kind: "identity" };
  if (source.refinement.kind === "ambiguous") return { kind: "rejected",
    reason: "The checked source value refinement is ambiguous, so C# cannot select one storage-read projection." };
  if (storageType.kind === "target-named" &&
      (storageType as CsharpTargetNamedTypeRef).csharpFlowRefinementRepresentation === "identity") return { kind: "identity" };
  const target = refinement.flowReadTargetType;
  if (target === undefined) return { kind: "rejected",
    reason: "The exact checked source value refinement has no closed C# representation." };
  if (targetTypeRefEquals(storageType, target)) return { kind: "identity" };
  const selection = selectCsharpFlowReadConversion(policy, storageType, target);
  return selection.kind === "rejected" ? selection : { kind: "conversion", source: storageType, target, selection };
}
