import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { selectCsharpAwaitCompletion } from "../../target-model/types/await-completions.js";
import { csharpCarrierAdmitsSourceAbsence, getCsharpTaskResultTargetType, isCsharpVoidTargetType } from "../../target-model/types/index.js";
import { selectCsharpConversion } from "./selection/core.js";
import { csharpConversionIsApplicable } from "../../target-model/conversions/selection.js";

export function selectCsharpContextualAsyncReturn(
  policy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers" | "target">,
  inferred: TargetTypeRef,
  contextual: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const source = getCsharpTaskResultTargetType(inferred);
  if (source === undefined || contextual === undefined) return undefined;
  const candidates = selectCsharpAwaitCompletion(contextual, policy.typeDefinitions)?.alternatives.filter(alternative =>
    alternative.task && (isCsharpVoidTargetType(source)
      ? isCsharpVoidTargetType(alternative.result) || csharpCarrierAdmitsSourceAbsence(alternative.result)
      : csharpConversionIsApplicable(selectCsharpConversion(policy, source, alternative.result, "implicit"), "implicit")));
  return candidates?.length === 1 ? candidates[0]!.carrier : undefined;
}
