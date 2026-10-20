import { type SourceNativeValueGuard } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpClosedTypePredicate } from "../../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../operators/type-tests.js";

import { csharpCarrierAdmitsSourceAbsence, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
export type CsharpNativeFlowPredicate = CsharpClosedTypePredicate | { readonly kind: "typeof"; readonly value: string; readonly negated: boolean }
  | Extract<SourceNativeValueGuard, { readonly kind: "literal" }>
  | { readonly kind: "absence"; readonly negated: boolean };

export function selectCsharpNativeCarrierPredicate(definitions: CsharpTypeDefinitions | undefined, member: TargetTypeRef, predicate: CsharpNativeFlowPredicate): boolean | undefined {
  if (predicate.kind === "absence") {
    if (isCsharpAbsenceTargetType(member)) return !predicate.negated;
    if (csharpCarrierAdmitsSourceAbsence(member)) return undefined;
    return getCsharpTypeofRuntimeKind(member, definitions) === undefined ? undefined : predicate.negated;
  }
  const category = getCsharpTypeofRuntimeKind(member, definitions);
  if (predicate.kind === "literal") {
    if (isCsharpAbsenceTargetType(member)) return predicate.negated;
    const numeric = (category === "number" || category === "bigint") &&
      (predicate.category === "number" || predicate.category === "bigint");
    return category === undefined || category === predicate.category || numeric ? undefined : predicate.negated;
  }
  if (predicate.kind === "typeof") return category === undefined ? undefined : (category === predicate.value) !== predicate.negated;
  if (predicate.kind === "nominal") {
    if (targetTypeRefEquals(member, predicate.targetCarrier)) return true;
    if (member.kind === "array" || getCsharpJsArrayElementTargetType(member) !== undefined ||
      category !== undefined && category !== "object") return false;
  }
  const test = selectCsharpClosedTypeTestPlan(member, predicate, undefined, definitions);
  return test?.kind === "constant" ? test.value : undefined;
}
