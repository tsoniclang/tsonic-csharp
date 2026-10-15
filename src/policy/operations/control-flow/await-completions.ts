import type { CsharpAwaitAlternative, CsharpAwaitCompletion } from "../../../target-model/types/await-completions.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { csharpUnionLeaves, csharpUnionProjectionPath, selectCsharpUnionArmMapping } from "../../../target-model/types/union-relations.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function selectCsharpAwaitCompletion(
  carrier: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): CsharpAwaitCompletion | undefined {
  if (carrier === undefined) return undefined;
  const present = getCsharpNullableElementTargetType(carrier);
  const leaves = getCsharpRuntimeUnionArms(present ?? carrier, definitions) === undefined
    ? [{ carrier: present ?? carrier, path: [] }]
    : csharpUnionLeaves(present ?? carrier, definitions);
  if (leaves === undefined) return undefined;
  if (leaves.length === 0 || leaves.some(leaf => leaf.carrier.kind === "type-parameter" ||
    leaf.carrier.kind === "opaque" || isCsharpJsValueTargetType(leaf.carrier))) return undefined;
  const alternatives = leaves.map(leaf => {
    const taskResult = leaf.carrier.kind === "target-named"
      ? (leaf.carrier as { readonly csharpTaskResultType?: TargetTypeRef }).csharpTaskResultType : undefined;
    return { carrier: leaf.carrier, sourcePath: leaf.path,
      result: taskResult ?? leaf.carrier, task: taskResult !== undefined };
  });
  const results = alternatives.flatMap(alternative => {
    const element = getCsharpNullableElementTargetType(alternative.result);
    return element === undefined ? [alternative.result] : [element, csharpAbsenceTargetType()];
  });
  if (present !== undefined && results.some(result => !isCsharpVoidTargetType(result))) {
    results.push(csharpVoidTargetType());
  }
  const result = combineCsharpTargetUnionMembers(results);
  if (result === undefined) return undefined;
  const resultElement = getCsharpNullableElementTargetType(result) ?? result;
  const selected = alternatives.map(alternative => {
    const resultPath = targetTypeRefEquals(alternative.result, result) || targetTypeRefEquals(alternative.result, resultElement) ||
      isCsharpVoidTargetType(alternative.result) || isCsharpAbsenceTargetType(alternative.result)
      ? [] : csharpUnionProjectionPath(resultElement, alternative.result, definitions);
    if (resultPath !== undefined) return Object.freeze({ ...alternative, resultPath });
    const arms = selectCsharpUnionArmMapping(
      getCsharpNullableElementTargetType(alternative.result) ?? alternative.result,
      resultElement, "source", definitions);
    return arms === undefined ? undefined : Object.freeze({ ...alternative, resultPath: [],
      resultMapping: Object.freeze({ kind: "union-map" as const, coverage: "source" as const, arms }) });
  });
  return selected.some(alternative => alternative === undefined) ? undefined : Object.freeze({
    result, alternatives: Object.freeze(selected as readonly CsharpAwaitAlternative[]),
    optional: present !== undefined,
  });
}

export function getCsharpAwaitResultTargetType(
  type: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  return selectCsharpAwaitCompletion(type, definitions)?.result;
}
