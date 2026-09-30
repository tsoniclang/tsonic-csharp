import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpRuntimeUnionProjection } from "../../policy/conversions/selection/carriers.js";
import type { CsharpConversionSelection } from "../../policy/conversions/selection/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export function csharpRuntimeUnionProjectionMatches(
  policy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers">,
  source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
): boolean {
  if (source === undefined || target === undefined) return false;
  const expected = selectCsharpRuntimeUnionProjection(policy, source, target);
  return expected.kind === "runtime-union-projection" && expected.armIndex === selection.armIndex &&
    expected.retainsAbsence === selection.retainsAbsence && targetTypeRefEquals(expected.armType, selection.armType) &&
    (expected.refinement === undefined || selection.refinement === undefined
      ? expected.refinement === selection.refinement : targetTypeRefEquals(expected.refinement, selection.refinement));
}
