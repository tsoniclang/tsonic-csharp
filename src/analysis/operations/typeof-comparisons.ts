import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectCsharpTypeofComparison } from "../../policy/operations/index.js";
import type { CsharpTypeofRuntimeKind } from "../../policy/types/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpBinaryClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpTypeofResult } from "../../target-model/types/runtime-kind.js";
import type { SourceNullishAdmission, SourceTypeDescriptor, SourceTypeofCategoryName } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { csharpRefusal, isCsharpRefusal, type CsharpRefusal } from "../../representation/index.js";
import { selectCsharpJsTypeofOperation } from "./js-values.js";

/**
 * How C# answers `typeof operand` at one operation (N3', N7, A1, A7, C-2479 decision 2 (c), K-2665):
 * - `dynamic`: the operand's carrier is the opaque JS value (TsValue: `unknown`, `any`). The existing runtime operation
 *   `TsValue.ApplyDynamicTypeof` (jsTypeof, published for the operand node) reads the category at run time. No static
 *   category is selected or required: the Host proves none for an opaque value, and its absent admission is unproven.
 * - `static`: a closed carrier. The Host typeof record (facts.values.typeofCategory) is the only category authority:
 *   C# projects it onto the physical carrier (the nullable element, or the runtime union arms positional in Host arm
 *   order, R6). It never classifies a category from a carrier (a Q1 int64 of number origin stays "number", K-2658).
 * - a CSHARP_ refusal: a closed carrier whose Host category is unproven (a type parameter, `object`, an arm whose
 *   values prove no single category). The carrier cannot recover the TypeScript category (one native carrier holds
 *   number- and bigint-origin wide integers) and the target keeps no runtime category for it.
 * A missing Host mapping for a supported form (an arm of a published closed sum, the nullable carrier of a nullish
 * operand) is an invariant failure.
 */
export type CsharpTypeofSelection =
  | { readonly kind: "dynamic" }
  | { readonly kind: "static"; readonly carrier: TargetTypeRef; readonly result: CsharpTypeofResult }
  | CsharpRefusal;

const dynamicTypeof = Object.freeze({ kind: "dynamic" as const });

export function selectCsharpTypeofSelection(
  policy: CsharpPolicyContext,
  operation: Node,
  operand: Node,
): CsharpTypeofSelection {
  // The dynamic operation is decided first, by the same selection the emission reads (jsTypeof), so a static
  // classification never preempts it.
  if (selectCsharpJsTypeofOperation(policy, operand).kind === "resolved") return dynamicTypeof;
  const carrier = policy.types.value(operand);
  if (isCsharpRefusal(carrier)) return carrier;
  const record = policy.facts.values.typeofCategory(operation, operand);
  if (record.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
    "A refused typeof site is a Host refusal; Host refusals are forwarded before C# analysis.", operation);
  // The absent value's category is the Host decision (SourceNullishAdmission.absentCategory, published for every
  // admission other than "none"; C-2479 2(c), Q20). C# never decides it.
  const absent = record.admission === "none" ? undefined
    : record.absentCategory ?? missing(operation, "the absent category of a nullish-admitting operand");
  if (isCsharpAbsenceTargetType(carrier)) {
    if (absent === undefined) return missing(operation, "a nullish admission for an absence-only operand");
    return Object.freeze({ kind: "static" as const, carrier, result: absent });
  }
  const element = getCsharpNullableElementTargetType(carrier);
  const present = element ?? carrier;
  const value = record.sum === undefined
    ? record.category ?? notProven(operation)
    : sumCategories(policy, operation, present, record.sum);
  if (isCsharpRefusal(value)) return value;
  if (element === undefined) {
    if (absent !== undefined) return missing(operation, "the nullable carrier of a nullish-admitting operand");
    return Object.freeze({ kind: "static" as const, carrier, result: value });
  }
  // admission "none" on a nullable physical carrier: the Host proves no absent value reaches the operation, so the
  // absent branch is unreachable; it reads the runtime category of the C# null (a target fact, not a Source decision).
  return Object.freeze({ kind: "static" as const, carrier,
    result: Object.freeze({ kind: "optional" as const, sourceCarrier: carrier, element, value, absent: absent ?? "object" }) });
}

/** Host closed-arm categories projected onto the carrier of the present arms (absence is lifted to the nullable). */
function sumCategories(
  policy: CsharpPolicyContext,
  operation: Node,
  carrier: TargetTypeRef,
  published: NonNullable<SourceNullishAdmission["sum"]>,
): CsharpTypeofResult | CsharpRefusal {
  const sum = policy.facts.sums.sum(published.identity);
  // Every closed arm, once, from its role (A7). An arm listed by two roles carries one category.
  const categories = new Map<number, SourceTypeofCategoryName | "unproven">();
  for (const role of published.roles) {
    for (const entry of role.arms) {
      const known = categories.get(entry.arm);
      if (known !== undefined && known !== entry.category) missing(operation, "one category per closed arm");
      categories.set(entry.arm, entry.category);
    }
  }
  if (categories.size !== sum.arms.length) missing(operation, "exactly one category per closed arm of the published sum");
  const present: (SourceTypeofCategoryName | "unproven")[] = [];
  for (const [index, arm] of sum.arms.entries()) {
    const category = categories.get(index) ?? missing(operation, "a category for every closed arm of the published sum");
    if (!isAbsenceDescriptor(arm.type)) present.push(category);
  }
  const arms = getCsharpRuntimeUnionArms(carrier, policy.typeDefinitions);
  if (arms === undefined) {
    // One scalar carrier holds every present arm, so they share one category.
    if (present.includes("unproven")) return notProven(operation);
    if (new Set(present).size !== 1) return missing(operation, "a runtime union carrier for closed arms of different categories");
    return present[0] as CsharpTypeofRuntimeKind;
  }
  if (arms.length !== present.length) return missing(operation, "one published category per runtime union arm");
  if (present.includes("unproven")) return notProven(operation);
  return Object.freeze({ kind: "runtime-union" as const, sourceCarrier: carrier,
    arms: Object.freeze(arms.map((arm, index) => Object.freeze({ carrier: arm, result: present[index] as CsharpTypeofRuntimeKind }))) });
}

function isAbsenceDescriptor(type: SourceTypeDescriptor): boolean {
  return type.kind === "intrinsic" && (type.intrinsic === "absence" || type.intrinsic === "void");
}

function notProven(operation: Node): CsharpRefusal {
  return csharpRefusal("CSHARP_TYPEOF_RUNTIME_KIND_NOT_PROVEN",
    "C# typeof translation requires one exact statically proven target runtime kind.", operation);
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
  const selected = selectCsharpTypeofSelection(policy, comparison, guard.sourceOperand);
  return Object.freeze({
    operand: guard.sourceOperand,
    runtimeKind,
    // A dynamic operand compares the runtime typeof string (typeof-emission); it has no static category selection.
    selection: selected.kind === "dynamic" ? selected
      : isCsharpRefusal(selected) ? Object.freeze({ kind: "rejected" as const, reason: selected.message, code: selected.code })
      : selectCsharpTypeofComparison(selected.carrier, selected.result, runtimeKind, guard.negated),
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
