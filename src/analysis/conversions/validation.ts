import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpUnionReferenceImplicitlyAccepts, selectCsharpRuntimeUnionProjection } from "../../policy/conversions/selection/carriers.js";
import type { CsharpConversionSelection } from "../../policy/conversions/selection/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpUnionArmMappingsMatch, csharpUnionPathsEqual } from "../../target-model/types/union-relations.js";
import { csharpMetadataDescriptors } from "../../target-model/metadata/immutable.js";

export function csharpRuntimeUnionMappingMatches(
  policy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>,
): boolean {
  if (source === undefined || target === undefined || selection === null || typeof selection !== "object" || Array.isArray(selection)) return false;
  try {
    const fields = csharpMetadataDescriptors(selection);
    if (Object.keys(fields).length !== 3 || fields.kind?.value !== "union-map" || fields.coverage === undefined || fields.arms === undefined) return false;
    const coverage: unknown = fields.coverage.value;
    if (coverage !== "source" && coverage !== "target") return false;
    return csharpUnionArmMappingsMatch(source, target, coverage, fields.arms.value as Extract<CsharpConversionSelection, { readonly kind: "union-map" }>["arms"],
      policy.typeDefinitions, coverage === "source"
        ? (sourceArm, targetArm) => csharpUnionReferenceImplicitlyAccepts(policy, sourceArm, targetArm) : undefined);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function csharpRuntimeUnionProjectionMatches(
  policy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
): boolean {
  if (source === undefined || target === undefined) return false;
  const expected = selectCsharpRuntimeUnionProjection(policy, source, target);
  return expected.kind === "runtime-union-projection" && csharpUnionPathsEqual(expected.path, selection.path) &&
    expected.retainsAbsence === selection.retainsAbsence && targetTypeRefEquals(expected.armType, selection.armType) &&
    (expected.refinement === undefined || selection.refinement === undefined
      ? expected.refinement === selection.refinement : targetTypeRefEquals(expected.refinement, selection.refinement));
}
