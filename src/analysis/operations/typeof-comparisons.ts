import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectCsharpTypeofComparison } from "../../policy/operations/index.js";
import type { CsharpTypeofRuntimeKind } from "../../policy/types/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpBinaryClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpTypeofResult } from "../../target-model/types/runtime-kind.js";
import type { SourceNullishAdmission, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpRefusal, type CsharpRefusal } from "../../representation/index.js";

/**
 * The typeof result of `typeof operand` (or a typeof comparison) at one operation (N3', A1, A7, C-2479 decision 2 (c)).
 * Category authority is the Host typeof record only (facts.values.typeofCategory), taken from the declared TS type
 * before erasure: a scalar operand carries one category, a closed-sum operand carries the category of every closed arm.
 * C# only projects the Host categories onto the physical carrier (the nullable element, or the runtime union arms
 * positional in Host arm order, R6) and emits the runtime test; it never classifies a category from a carrier (a Q1
 * int64 of number origin stays "number"). A missing published category for a supported form is an invariant failure.
 */
export function selectCsharpTypeofResult(
  policy: CsharpPolicyContext,
  operation: Node,
  operand: Node,
): CsharpTypeofResult | CsharpRefusal {
  const carrier = policy.types.value(operand);
  if (isCsharpRefusal(carrier)) return carrier;
  const admission = policy.facts.values.typeofCategory(operation, operand);
  if (admission.admission === "both" || admission.admission === "unavailable") return failTargetAnalysisInvariant("tsonic-csharp",
    "typeof over a value that may be null or undefined (or is unproved) is a Host refusal; Host refusals are forwarded before C# analysis.",
    operation);
  const absent = admission.admission === "undefined-only" ? "undefined" as const : "object" as const;
  if (isCsharpAbsenceTargetType(carrier)) {
    if (admission.admission === "none") return missing(operation, "an absence-only operand without a nullish admission");
    return absent;
  }
  const element = getCsharpNullableElementTargetType(carrier);
  const present = element ?? carrier;
  const value = admission.sum === undefined
    ? admission.category ?? missing(operation, "a scalar typeof category")
    : sumCategories(policy, operation, present, admission.sum);
  if (element === undefined) {
    if (admission.admission !== "none") return missing(operation, "the nullable carrier of a nullish-admitting operand");
    return value;
  }
  return Object.freeze({ kind: "optional" as const, sourceCarrier: carrier, element, value, absent });
}

/** Host closed-arm categories projected onto the runtime union arms (present arms in Host order; absence is lifted). */
function sumCategories(
  policy: CsharpPolicyContext,
  operation: Node,
  carrier: TargetTypeRef,
  published: NonNullable<SourceNullishAdmission["sum"]>,
): CsharpTypeofResult {
  const sum = policy.facts.sums.sum(published.identity);
  const present = [...published.arms]
    .filter(entry => !isAbsenceDescriptor(sum.arms[entry.arm]?.type ?? missing(operation, "a closed arm of the published sum")))
    .sort((left, right) => left.arm - right.arm);
  const arms = getCsharpRuntimeUnionArms(carrier, policy.typeDefinitions);
  if (arms === undefined) {
    // A sum whose present arms share one carrier (one present arm) has a scalar carrier; its single Host category applies.
    if (present.length !== 1) return missing(operation, "the runtime union carrier of a multi-arm sum");
    return present[0]!.category;
  }
  if (arms.length !== present.length) return missing(operation, "one published category per runtime union arm");
  return Object.freeze({ kind: "runtime-union" as const, sourceCarrier: carrier,
    arms: Object.freeze(arms.map((arm, index) => Object.freeze({ carrier: arm, result: present[index]!.category }))) });
}

function isAbsenceDescriptor(type: SourceTypeDescriptor): boolean {
  return type.kind === "intrinsic" && (type.intrinsic === "absence" || type.intrinsic === "void");
}

function missing(operation: Node, subject: string): never {
  return failTargetAnalysisInvariant("tsonic-csharp", `The Host typeof record has no ${subject} for a supported form.`, operation);
}

export function classifyTypeofComparison(
  policy: CsharpPolicyContext,
  comparison: Node,
): CsharpBinaryClassification["typeofComparison"] {
  const guard = policy.facts.analyses.nativeValueGuard(comparison);
  if (guard?.kind !== "typeof") {
    return undefined;
  }
  const runtimeKind = runtimeKindLiteral(guard.value);
  if (runtimeKind === undefined) {
    return undefined;
  }
  const category = selectCsharpTypeofResult(policy, comparison, guard.sourceOperand);
  const carrier = policy.types.value(guard.sourceOperand);
  return Object.freeze({
    operand: guard.sourceOperand,
    runtimeKind,
    selection: isCsharpRefusal(carrier)
      ? Object.freeze({ kind: "rejected" as const, reason: carrier.message, code: carrier.code })
      : isCsharpRefusal(category) ? Object.freeze({ kind: "rejected" as const, reason: category.message, code: category.code })
      : selectCsharpTypeofComparison(carrier, category, runtimeKind, guard.negated),
  });
}

function runtimeKindLiteral(
  value: string,
): CsharpTypeofRuntimeKind | undefined {
  return value === "string" ||
      value === "number" ||
      value === "boolean" ||
      value === "bigint" ||
      value === "symbol" ||
      value === "object" ||
      value === "function" ||
      value === "undefined"
    ? value
    : undefined;
}
