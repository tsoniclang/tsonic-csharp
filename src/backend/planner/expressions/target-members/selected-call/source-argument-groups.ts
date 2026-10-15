import type { CsharpSourceCallArgumentClassification } from "../../../../../target-model/records/operations.js";
import type { TargetTypeRef } from "../../../../../target-model/types/model.js";

export interface CsharpSourceArgumentGroup {
  readonly parameterIndex: number;
  readonly type: TargetTypeRef;
  readonly collect: boolean;
  readonly arguments: readonly { readonly index: number; readonly spread: boolean }[];
}

export function csharpSourceArgumentGroups(
  classification: CsharpSourceCallArgumentClassification,
  exactArity = false,
): readonly CsharpSourceArgumentGroup[] | undefined {
  const parameters = classification.sourceNativeParameters;
  const grouping = classification.sourceArgumentGrouping;
  if (parameters === undefined || grouping?.kind !== "grouped") return undefined;
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const groups: CsharpSourceArgumentGroup[] = [];
  const rest: { readonly index: number; readonly spread: boolean; readonly type: TargetTypeRef }[] = [];
  for (const entry of grouping.arguments) {
    const argument = { index: entry.sourceArgumentIndex, spread: entry.spread, type: entry.type };
    if (parameters[entry.parameterIndex]?.paramsArray === true) rest.push(argument);
    else groups.push({ parameterIndex: entry.parameterIndex, type: entry.type, collect: false, arguments: [argument] });
  }
  if (restIndex >= 0 && (rest.length > 0 || exactArity)) {
    if (!exactArity && rest.every(argument => !argument.spread)) {
      groups.push(...rest.map(argument => ({ parameterIndex: restIndex, type: argument.type, collect: false, arguments: [argument] })));
    } else {
      groups.push({ parameterIndex: restIndex, type: parameters[restIndex]!.type,
        collect: rest.length !== 1 || !rest[0]!.spread, arguments: rest });
    }
  }
  const bound = new Set(groups.map(group => group.parameterIndex));
  for (const [parameterIndex, parameter] of parameters.entries()) {
    if (bound.has(parameterIndex) || parameter.paramsArray === true) continue;
    if (exactArity) groups.push({ parameterIndex, type: parameter.type, collect: false, arguments: [] });
  }
  return groups.sort((left, right) => left.parameterIndex - right.parameterIndex);
}
