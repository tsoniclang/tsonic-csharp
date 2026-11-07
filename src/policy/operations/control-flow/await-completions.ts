import type { CsharpAwaitAlternative, CsharpAwaitCompletion } from "../../../target-model/types/await-completions.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { csharpUnionProjectionPath, selectCsharpUnionArmMapping } from "../../conversions/union-relations.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

/**
 * The task/value alternatives of an awaited operand carrier: one per native leaf (a union carrier contributes its
 * leaves), each with its task result. Undefined when a leaf has no native await form. Target-only (no Source decision).
 */
export function selectCsharpAwaitAlternatives(
  carrier: TargetTypeRef | undefined, definitions: CsharpTypeDefinitions | undefined,
): readonly Omit<CsharpAwaitAlternative, "resultPath" | "resultMapping">[] | undefined {
  if (carrier === undefined) return undefined;
  const present = getCsharpNullableElementTargetType(carrier);
  const leaves = getCsharpRuntimeUnionArms(present ?? carrier, definitions) === undefined
    ? [{ carrier: present ?? carrier, path: [] }]
    : csharpUnionLeaves(present ?? carrier, definitions);
  if (leaves === undefined) return undefined;
  if (leaves.length === 0 || leaves.some(leaf => leaf.carrier.kind === "type-parameter" && leaf.path.length === 0 ||
    leaf.carrier.kind === "opaque" || isCsharpJsValueTargetType(leaf.carrier))) return undefined;
  return Object.freeze(leaves.map(leaf => {
    const taskResult = leaf.carrier.kind === "target-named"
      ? (leaf.carrier as { readonly csharpTaskResultType?: TargetTypeRef }).csharpTaskResultType : undefined;
    const result = taskResult ?? leaf.carrier;
    return Object.freeze({ carrier: leaf.carrier, sourcePath: leaf.path,
      result, task: taskResult !== undefined,
      resultForm: isCsharpVoidTargetType(result) ? "void" as const : isCsharpAbsenceTargetType(result) ? "absence" as const : "value" as const });
  }));
}

/**
 * The native completion of awaiting a carrier. The awaited result is the Host one (facts.values.awaited, represented);
 * C# only maps each task/value alternative of the operand carrier onto it and never combines a union itself (R6).
 */
export function selectCsharpAwaitCompletion(
  carrier: TargetTypeRef | undefined,
  awaited: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
  resultUse: "consumed" | "discarded" = "consumed",
): CsharpAwaitCompletion | undefined {
  if (carrier === undefined) return undefined;
  const present = getCsharpNullableElementTargetType(carrier);
  if (carrier.kind === "type-parameter") return resultUse === "discarded" ? Object.freeze({
    form: "task-test", discard: true, excludeUnmatched: false, result: csharpVoidTargetType(),
    alternatives: Object.freeze([]), optional: false,
  }) : undefined;
  const alternatives = selectCsharpAwaitAlternatives(carrier, definitions);
  if (alternatives === undefined) return undefined;
  const identity = !alternatives.some(alternative => alternative.task);
  const result = identity ? carrier : awaited;
  const resultElement = getCsharpNullableElementTargetType(result) ?? result;
  const selected = alternatives.map(alternative => {
    const resultPath = identity ? alternative.sourcePath
      : targetTypeRefEquals(alternative.result, result) || targetTypeRefEquals(alternative.result, resultElement) ||
      isCsharpVoidTargetType(alternative.result) || isCsharpAbsenceTargetType(alternative.result)
      ? [] : csharpUnionProjectionPath(resultElement, alternative.result, definitions);
    if (resultPath !== undefined) return Object.freeze({ ...alternative, resultPath });
    const arms = selectCsharpUnionArmMapping(
      getCsharpNullableElementTargetType(alternative.result) ?? alternative.result,
      resultElement, "source", definitions);
    return arms === undefined ? undefined : Object.freeze({ ...alternative, resultPath: [],
      resultMapping: Object.freeze({ kind: "union-map" as const, coverage: "source" as const, arms }) });
  });
  if (selected.some(alternative => alternative === undefined)) return undefined;
  const native: CsharpAwaitCompletion = Object.freeze({
    form: identity ? "identity"
      : alternatives.length === 1 && present === undefined && alternatives[0]!.sourcePath.length === 0 ? "direct"
      : !isCsharpVoidTargetType(result) && alternatives.some(alternative => alternative.task && alternative.resultForm === "void") ? "void-branches" : "branches",
    discard: isCsharpVoidTargetType(result),
    excludeUnmatched: alternatives.some(alternative => alternative.sourcePath.length > 0),
    result, alternatives: Object.freeze(selected as readonly CsharpAwaitAlternative[]),
    optional: present !== undefined,
  });
  return native;
}

/** The completion of `await e`: the operand carrier and the Host awaited result (facts.values.awaited) represented. */
export function selectCsharpSourceCallAwaitCompletion(
  operand: TargetTypeRef,
  awaited: TargetTypeRef,
  definitions: CsharpTypeDefinitions | undefined,
  resultUse: "consumed" | "discarded",
): CsharpAwaitCompletion | undefined {
  return selectCsharpAwaitCompletion(operand, awaited, definitions, resultUse);
}
