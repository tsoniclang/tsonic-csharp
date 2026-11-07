import type { CsharpConversionMode, CsharpConversionSelection } from "./selection.js";
import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../types/carriers/nullable.js";
import { isCsharpJsValueTargetType } from "../types/carriers/runtime-carriers.js";

// Carrier predicates of N3′ / WP0 A3 exact number erasure, shared by analysis (which reads the Host admission) and the
// planner (which applies the sealed use-scoped record). They name where the Host fact is required; they decide nothing.

/** The C# carrier of the Host int64 descriptor (`representation/descriptors.ts`: primitive → source-primitive). */
const int64Carrier = csharpSourcePrimitiveTargetType("int64");

/**
 * An implicit use of the int64 carrier into a broad carrier (TsValue for unknown/any, System.Object, either nullable):
 * the only conversions at which the Host slot admission can be `exact-number-erasure`.
 */
export function csharpNumberErasureCandidate(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined,
  mode: CsharpConversionMode): source is TargetTypeRef {
  if (mode !== "implicit" || source === undefined || target === undefined || !targetTypeRefEquals(source, int64Carrier)) return false;
  const destination = getCsharpNullableElementTargetType(target) ?? target;
  return isCsharpJsValueTargetType(destination) || targetTypeRefEquals(destination, csharpObjectTargetType());
}

/**
 * The pair-scoped CLR relations that a use's sealed number erasure supersedes: boxing the int64 carrier into TsValue
 * or System.Object. Any other selection at an erasure use is conflicting evidence.
 */
export function csharpNumberErasureSupersedes(selection: CsharpConversionSelection): boolean {
  return selection.kind === "js-value-box" || selection.kind === "implicit" && selection.proof === "reference";
}
