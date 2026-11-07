// The C# better-conversion-target rule over .NET carriers (R4 #37: a .NET overload rule belongs to policy, not analysis).
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpProviderCallSelectionHost } from "../model/provider-calls.js";
import { selectCsharpConversion } from "./core.js";
import { csharpConversionIsApplicable } from "./applicability.js";

/**
 * C# better conversion target (ECMA-334 12.6.4.7): T1 is better than T2 when an implicit conversion T1 → T2 exists
 * and none T2 → T1. A .NET overload rule over target carriers only.
 */
export function compareCsharpConversionTargets(
  host: Pick<CsharpProviderCallSelectionHost, "projectTypes" | "providers" | "target" | "typeDefinitions" | "objectShapes">,
  left: TargetTypeRef,
  right: TargetTypeRef,
): "left" | "right" | "equivalent" | "incomparable" {
  if (targetTypeRefEquals(left, right)) return "equivalent";
  const leftToRight = csharpConversionIsApplicable(selectCsharpConversion(host, left, right, "implicit"), "implicit");
  const rightToLeft = csharpConversionIsApplicable(selectCsharpConversion(host, right, left, "implicit"), "implicit");
  if (leftToRight === rightToLeft) return leftToRight ? "equivalent" : "incomparable";
  return leftToRight ? "left" : "right";
}
