import type { TargetTypeRef } from "./model.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";
import type { CsharpUnionArmMapping, CsharpUnionPathStep } from "./union-relations.js";
import { csharpUnionLeaves, csharpUnionProjectionPath, selectCsharpUnionArmMapping } from "./union-relations.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "./runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import { isCsharpVoidTargetType } from "./identity.js";
import { csharpVoidTargetType } from "./scalar-types.js";
import { targetTypeRefEquals } from "./equality.js";

export interface CsharpAwaitAlternative {
  readonly carrier: TargetTypeRef;
  readonly sourcePath: readonly CsharpUnionPathStep[];
  readonly result: TargetTypeRef;
  readonly task: boolean;
  readonly resultPath: readonly CsharpUnionPathStep[];
  readonly resultMapping?: readonly CsharpUnionArmMapping[];
}

export interface CsharpAwaitCompletion {
  readonly result: TargetTypeRef;
  readonly alternatives: readonly CsharpAwaitAlternative[];
  readonly optional: boolean;
}

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
    const resultMapping = selectCsharpUnionArmMapping(
      getCsharpNullableElementTargetType(alternative.result) ?? alternative.result,
      resultElement, "source", definitions);
    return resultMapping === undefined ? undefined : Object.freeze({ ...alternative, resultPath: [], resultMapping });
  });
  return selected.some(alternative => alternative === undefined) ? undefined : Object.freeze({
    result, alternatives: Object.freeze(selected as readonly CsharpAwaitAlternative[]),
    optional: present !== undefined,
  });
}
