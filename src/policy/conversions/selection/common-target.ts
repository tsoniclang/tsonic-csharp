import { conversionIsImplicitlyApplicable, selectCsharpConversion } from "./core.js";
import { csharpConversionIsApplicable } from "./expression.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../types/index.js";
import type { CsharpCommonImplicitTargetSelection, CsharpConversionTargetPreference } from "./model.js";
import type { CsharpPolicyContext } from "../../context.js";
import type { TargetTypeRef } from "../../types/index.js";

export function selectCsharpCommonImplicitTarget(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  sources: readonly TargetTypeRef[],
  candidates: readonly TargetTypeRef[] = sources,
): CsharpCommonImplicitTargetSelection {
  if (sources.length === 0 || candidates.length === 0) {
    return {
      kind: "rejected",
      reason:
        "A common C# implicit conversion target requires non-empty exact source and candidate sets.",
    };
  }
  const uniqueCandidates = new Map<string, TargetTypeRef>();
  for (const candidate of candidates) {
    uniqueCandidates.set(targetTypeRefKey(candidate), candidate);
  }
  const applicable = [...uniqueCandidates.values()].filter((candidate) =>
    sources.every((source) =>
      csharpConversionIsApplicable(
        selectCsharpConversion(input, source, candidate, "implicit"),
        "implicit",
      )
    )
  );
  const mostSpecific = applicable.filter((candidate) =>
    !applicable.some((other) =>
      !targetTypeRefEquals(candidate, other) &&
      csharpConversionIsApplicable(
        selectCsharpConversion(input, other, candidate, "implicit"),
        "implicit",
      ) &&
      !csharpConversionIsApplicable(
        selectCsharpConversion(input, candidate, other, "implicit"),
        "implicit",
      )
    )
  );
  if (mostSpecific.length === 1) {
    return { kind: "resolved", target: mostSpecific[0]! };
  }
  return {
    kind: "rejected",
    reason: mostSpecific.length === 0
      ? "No exact candidate accepts every inferred C# return representation through implicit target conversions."
      : "More than one equally specific candidate accepts every inferred C# return representation.",
  };
}

export function compareCsharpImplicitConversionTargets(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  left: TargetTypeRef,
  right: TargetTypeRef,
): CsharpConversionTargetPreference {
  if (targetTypeRefEquals(left, right)) {
    return "equivalent";
  }
  const leftToRight = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, left, right, "implicit"),
  );
  const rightToLeft = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, right, left, "implicit"),
  );
  if (leftToRight === rightToLeft) {
    return leftToRight ? "equivalent" : "incomparable";
  }
  return leftToRight ? "left" : "right";
}
