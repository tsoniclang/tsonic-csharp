import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpUnionReferenceImplicitlyAccepts, selectCsharpRuntimeUnionProjection } from "../../policy/conversions/carriers.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpUnionArmMappingsMatch, csharpUnionPathsEqual } from "../../target-model/types/union-relations.js";
import { csharpMetadataDescriptors } from "../../target-model/metadata/immutable.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/index.js";

type CsharpUnionValidationPolicy = Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">;

const unionMappingRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union conversion requires exact sealed arm coverage and native absence correspondence." });
const unionProjectionRejected: CsharpConversionSelection = Object.freeze({ kind: "rejected",
  reason: "Union projection requires exact sealed payload and absence correspondence." });

export function admitCsharpUnionSelection(
  policy: CsharpUnionValidationPolicy,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: CsharpConversionSelection,
): CsharpConversionSelection {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if (selection.kind === "union-map") {
    return csharpRuntimeUnionMappingMatches(policy, sourceElement ?? source, targetElement ?? target, selection) &&
      !(selection.coverage === "target" && targetElement !== undefined && sourceElement === undefined)
      ? selection : unionMappingRejected;
  }
  if (selection.kind !== "runtime-union-projection") return selection;
  const selectedType = targetElement ?? target;
  return csharpRuntimeUnionProjectionMatches(policy, source, target, selection) &&
    typeof selection.retainsAbsence === "boolean" && selectedType !== undefined &&
    targetTypeRefEquals(selection.refinement ?? selection.armType, selectedType) &&
    !(selection.retainsAbsence && (sourceElement === undefined || targetElement === undefined))
    ? selection : unionProjectionRejected;
}

export function csharpRuntimeUnionMappingMatches(
  policy: CsharpUnionValidationPolicy,
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
  policy: CsharpUnionValidationPolicy,
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
