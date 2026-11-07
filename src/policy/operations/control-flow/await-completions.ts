import type { CsharpAwaitAlternative, CsharpAwaitCompletion } from "../../../target-model/types/await-completions.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { csharpSumArmSelection, csharpUnionProjectionPath, selectCsharpHostArmMapping } from "../../conversions/union-relations.js";
import type { CsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";
import type { SourceAwaitedArms, SourceProgramFacts, SourceSumFacts } from "@tsonic/target-api/source";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpTaskResultTargetType } from "../../../target-model/types/carriers/delegates.js";
import type { CsharpSourceCallResult } from "../../../target-model/operations/source-call-results.js";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { Node } from "@tsonic/tsts";

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
 * The Host awaited-arm relation of one await (or adopting call): facts.values.awaitedArms(use), with the sums it names.
 * Per present operand arm, the awaited-sum arm each arm of its payload resolves to (R6: the Source decision of which
 * awaited arm a task arm's value lands in is the Host's; C# only realizes it on the carriers).
 */
export interface CsharpHostAwaitedArms {
  readonly sums: Pick<SourceSumFacts, "sum">;
  readonly arms: SourceAwaitedArms;
}

export function csharpHostAwaitedArms(
  facts: Pick<SourceProgramFacts, "sums" | "values">,
  use: Node,
): CsharpHostAwaitedArms | undefined {
  const arms = facts.values.awaitedArms(use);
  return arms === undefined ? undefined : Object.freeze({ sums: facts.sums, arms });
}

/**
 * The payload moves of one task/value alternative into the awaited result union, from the Host awaited-arm relation:
 * the alternative's operand arm (its storage slot in the operand carrier, mapped back to the Host operand arm) names the
 * payload sum and the awaited arm of each payload arm; selectCsharpHostArmMapping realizes that Host map on the carriers.
 */
function hostAwaitedResultMapping(
  alternative: Omit<CsharpAwaitAlternative, "resultPath" | "resultMapping">,
  operand: TargetTypeRef,
  result: TargetTypeRef,
  host: CsharpHostAwaitedArms | undefined,
  definitions: CsharpTypeDefinitions | undefined,
): readonly CsharpUnionArmMapping[] | undefined {
  if (host === undefined) {
    throw new TypeError("An await whose task result maps into an awaited union requires the Host awaited-arm relation (values.awaitedArms).");
  }
  const relation = host.arms;
  const operandSum = relation.operand === undefined ? undefined : host.sums.sum(relation.operand);
  const slot = alternative.sourcePath[0]?.index;
  const arm = operandSum === undefined ? 0 : operandSum.arms.findIndex((_, index) => {
    const selected = csharpSumArmSelection(operandSum, index, operand, definitions);
    return selected.kind === "present" && selected.index === (slot ?? 0);
  });
  const entry = relation.arms.find(candidate => candidate.arm === arm);
  if (entry?.payload === undefined) return undefined;
  const map = Object.freeze({ kind: "map" as const, use: relation.use, mode: "write" as const,
    source: entry.payload, destination: relation.awaited, mapping: entry.mapping });
  return selectCsharpHostArmMapping(map, host.sums.sum(entry.payload), host.sums.sum(relation.awaited),
    getCsharpNullableElementTargetType(alternative.result) ?? alternative.result, result, definitions);
}

/**
 * The native completion of awaiting a carrier. The awaited result is the Host one (facts.values.awaited, represented);
 * C# only maps each task/value alternative of the operand carrier onto it and never combines a union itself (R6). A
 * task result that is itself a union moves into the awaited union by the Host awaited-arm relation (`host`).
 */
export function selectCsharpAwaitCompletion(
  carrier: TargetTypeRef | undefined,
  awaited: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
  resultUse: "consumed" | "discarded" = "consumed",
  host?: CsharpHostAwaitedArms,
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
    const arms = hostAwaitedResultMapping(alternative, present ?? carrier, resultElement, host, definitions);
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

/**
 * Call-site Promise adoption (C-1373 A–F3): a call of a project, non-ambient callee whose physical C# result nests a
 * task (`Task<Task<T>>`, or `Task<U>` where U has a Task arm) completes the inner layer the way JS adoption does. The
 * adopted result is the Host awaited result of the call (facts.values.awaited, represented by the caller), never a C#
 * join (R6). "none": no adoption applies. undefined: the inner layer has no native await form (as at baseline), or the
 * awaited result is refused (`awaited` returns undefined; the caller reports that refusal).
 * `direct`: the payload is one Task, so the call unwraps it (`TaskExtensions.Unwrap`) and yields that Task; otherwise the
 * call keeps its exact physical Task and the `await` composes the deferred continuation (selectCsharpSourceCallAwaitCompletion).
 */
export function selectCsharpSourceCallAdoption(
  policy: Pick<CsharpPolicyContext, "ast" | "facts" | "typeDefinitions">,
  call: Node,
  declaration: Node | undefined,
  native: TargetTypeRef,
  awaited: () => TargetTypeRef | undefined,
): { readonly selectedType: TargetTypeRef; readonly completion: CsharpAwaitCompletion } | "none" | undefined {
  if (declaration === undefined || !policy.facts.navigation.identity.isProjectDeclaration(declaration)) return "none";
  for (let context: Node | undefined = declaration; context !== undefined; context = policy.ast.parent(context)) {
    if (policy.ast.hasModifierKind(context, "ambient")) return "none";
  }
  const payload = getCsharpTaskResultTargetType(native);
  if (payload === undefined) return "none";
  const nestedTask = getCsharpTaskResultTargetType(payload) !== undefined;
  if (!nestedTask &&
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(payload) ?? payload, policy.typeDefinitions) === undefined) return "none";
  const result = awaited();
  if (result === undefined) return undefined;
  const completion = selectCsharpAwaitCompletion(payload, result, policy.typeDefinitions, "consumed",
    csharpHostAwaitedArms(policy.facts, call));
  if (completion === undefined) return undefined;
  if (!completion.alternatives.some(alternative => alternative.task)) return "none";
  return Object.freeze({ selectedType: nestedTask && completion.form === "direct" ? payload : native, completion });
}

/**
 * The completion of `await e`: the operand carrier and the Host awaited result (facts.values.awaited) represented. When
 * the operand is a source call whose result kept its physical Task with a deferred adoption continuation, the await
 * first awaits that Task (native layer) and then completes the continuation (baseline adoption composition).
 */
export function selectCsharpSourceCallAwaitCompletion(
  operand: TargetTypeRef,
  awaited: TargetTypeRef,
  definitions: CsharpTypeDefinitions | undefined,
  resultUse: "consumed" | "discarded",
  host: CsharpHostAwaitedArms | undefined,
  sourceResult?: CsharpSourceCallResult,
): CsharpAwaitCompletion | undefined {
  const selectedContinuation = sourceResult?.completion !== undefined &&
    getCsharpTaskResultTargetType(sourceResult.nativeType) !== undefined &&
    targetTypeRefEquals(sourceResult.nativeType, getCsharpNullableElementTargetType(operand) ?? operand)
    ? sourceResult.completion : undefined;
  if (selectedContinuation === undefined) return selectCsharpAwaitCompletion(operand, awaited, definitions, resultUse, host);
  const layer = getCsharpTaskResultTargetType(sourceResult!.nativeType)!;
  const native = selectCsharpAwaitCompletion(operand, getCsharpNullableElementTargetType(operand) === undefined ? layer
    : csharpNullableTargetType(layer), definitions, resultUse);
  if (native === undefined) return undefined;
  const continuation = !native.optional || selectedContinuation.optional ? selectedContinuation
    : Object.freeze({ ...selectedContinuation, optional: true,
      result: isCsharpVoidTargetType(selectedContinuation.result) ? selectedContinuation.result
        : csharpNullableTargetType(selectedContinuation.result) });
  return Object.freeze({ ...native, result: continuation.result, discard: continuation.discard,
    adoption: Object.freeze({ native, continuation }) });
}
