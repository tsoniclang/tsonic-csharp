import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { selectCsharpAwaitCompletion } from "../operations/control-flow/await-completions.js";
import { csharpCarrierAdmitsSourceAbsence, csharpNullableTargetType, getCsharpTaskResultTargetType, isCsharpVoidTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { selectCsharpConversion } from "./core.js";
import { csharpConversionIsApplicable } from "./applicability.js";

export function selectCsharpContextualAsyncReturn(
  policy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers" | "target">,
  inferred: TargetTypeRef,
  contextual: TargetTypeRef | undefined,
  authority: "authored" | "inferred",
): TargetTypeRef | undefined {
  const source = getCsharpTaskResultTargetType(inferred);
  if (source === undefined || contextual === undefined || authority !== "authored" && authority !== "inferred") return undefined;
  const candidates = selectCsharpAwaitCompletion(contextual, policy.typeDefinitions)?.alternatives.filter(alternative =>
    alternative.task && (isCsharpVoidTargetType(source)
      ? isCsharpVoidTargetType(alternative.result) || csharpCarrierAdmitsSourceAbsence(alternative.result)
      : (authority === "authored" || targetTypeRefEquals(source, alternative.result) ||
        targetTypeRefEquals(csharpNullableTargetType(source), alternative.result)) &&
        csharpConversionIsApplicable(selectCsharpConversion(policy, source, alternative.result, "implicit"), "implicit")));
  return candidates?.length === 1 ? candidates[0]!.carrier : undefined;
}
