import type { ResolvedSourceCallInfo, CsharpSourceCallArgumentClassification } from "../../../../../analysis/operations/index.js";
import type { TargetTypeRef } from "../../../../../target-model/types/model.js";

export interface CsharpSourceArgumentGroup {
  readonly type: TargetTypeRef;
  readonly rest: boolean;
  readonly arguments: readonly { readonly index: number; readonly spread: boolean }[];
}

export function csharpSourceArgumentGroups(
  source: ResolvedSourceCallInfo,
  classification: CsharpSourceCallArgumentClassification,
): readonly CsharpSourceArgumentGroup[] | undefined {
  const groups: CsharpSourceArgumentGroup[] = [];
  let previousParameter = -1;
  for (const [index] of source.sourceArguments.entries()) {
    const bindings = source.sourceArgumentBindings.filter(binding => binding.sourceArgumentIndex === index);
    const binding = bindings[0];
    if (binding === undefined || bindings.some(other => other.sourceParameterIndex !== binding.sourceParameterIndex ||
      other.sourceForm !== binding.sourceForm) || binding.sourceParameterIndex < previousParameter) return undefined;
    const parameter = source.sourceSelectedSignatureParameters[binding.sourceParameterIndex];
    const type = parameter?.rest ? classification.sourceParameterTypes?.[binding.sourceParameterIndex]
      : classification.sourceArgumentParameterTypes?.[source.sourceArgumentBindings.indexOf(binding)];
    if (parameter === undefined || type === undefined || binding.sourceForm === "spread-element") return undefined;
    const argument = { index, spread: binding.sourceForm === "spread-sequence" };
    if (parameter.rest && previousParameter === binding.sourceParameterIndex) {
      const previous = groups[groups.length - 1]!;
      groups[groups.length - 1] = { ...previous, arguments: [...previous.arguments, argument] };
    } else groups.push({ type, rest: parameter.rest, arguments: [argument] });
    previousParameter = binding.sourceParameterIndex;
  }
  return groups;
}
