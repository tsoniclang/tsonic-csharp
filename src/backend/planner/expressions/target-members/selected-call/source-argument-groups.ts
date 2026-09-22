import type { ResolvedSourceCallInfo, CsharpSourceCallArgumentClassification } from "../../../../../analysis/operations/index.js";
import type { TargetTypeRef } from "../../../../../target-model/types/model.js";

export interface CsharpSourceArgumentGroup {
  readonly parameterIndex: number;
  readonly type: TargetTypeRef;
  readonly collect: boolean;
  readonly arguments: readonly { readonly index: number; readonly spread: boolean }[];
}

export function csharpSourceArgumentGroups(
  source: ResolvedSourceCallInfo,
  classification: CsharpSourceCallArgumentClassification,
  exactArity = false,
): readonly CsharpSourceArgumentGroup[] | undefined {
  const parameters = classification.sourceNativeParameters;
  if (parameters === undefined) return undefined;
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const groups: CsharpSourceArgumentGroup[] = [];
  const rest: { readonly index: number; readonly spread: boolean; readonly type: TargetTypeRef }[] = [];
  let previousParameter = -1;
  for (const [index] of source.sourceArguments.entries()) {
    const bindings = source.sourceArgumentBindings.filter(binding => binding.sourceArgumentIndex === index);
    const binding = bindings[0];
    if (binding === undefined || bindings.length !== 1 || binding.sourceForm === "spread-element") return undefined;
    const parameterIndex = restIndex < 0 ? binding.effectiveArgumentIndex : Math.min(restIndex, binding.effectiveArgumentIndex);
    const parameter = parameters[parameterIndex];
    const type = classification.sourceArgumentParameterTypes?.[source.sourceArgumentBindings.indexOf(binding)];
    if (parameter === undefined || type === undefined || parameterIndex < previousParameter) return undefined;
    const argument = { index, spread: binding.sourceForm === "spread-sequence", type };
    if (parameter.paramsArray === true) rest.push(argument);
    else if (argument.spread) return undefined;
    else groups.push({ parameterIndex, type, collect: false, arguments: [argument] });
    previousParameter = parameterIndex;
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
    if (parameter.optional !== true) return undefined;
    if (exactArity) groups.push({ parameterIndex, type: parameter.type, collect: false, arguments: [] });
  }
  return groups.sort((left, right) => left.parameterIndex - right.parameterIndex);
}
