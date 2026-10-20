import { jsSourceInvocationOnlyCallableParameters } from "@tsonic/js-source-profile";

import { getCsharpDelegateSignature } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfileCallPolicyContext } from "../../../model/source-profiles.js";

import type { CsharpSelectedTargetCall, CsharpSelectedCallArgument } from "../../../../target-model/records/members.js";

export function sealInvocationOnlyCallableArguments(
  context: Pick<CsharpSourceProfileCallPolicyContext, "source" | "identity">,
  call: CsharpSelectedTargetCall,
): CsharpSelectedTargetCall | undefined {
  if (call.origin !== "source-profile") return undefined;
  const identity = context.identity;
  const parameterIndexes = jsSourceInvocationOnlyCallableParameters(
    identity.owner !== "js" || identity.kind !== "member" ||
      identity.declaringName === undefined || identity.name === undefined ? undefined
      : { ownerName: identity.declaringName, memberName: identity.name },
  );
  const argumentIndexes = new Set<number>();
  for (const parameterIndex of parameterIndexes) {
    const bindings = context.source.sourceArgumentBindings.filter(binding => binding.sourceParameterIndex === parameterIndex);
    if (bindings.length === 0 && context.source.sourceSelectedSignatureParameters[parameterIndex] !== undefined &&
      context.source.sourceSelectedSignatureParameters[parameterIndex]?.acceptsOmission !== true) return undefined;
    for (const sourceBinding of bindings) {
      const sourceIndex = sourceBinding.sourceArgumentIndex;
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= context.source.sourceArguments.length ||
        context.source.sourceArguments[sourceIndex] === undefined) return undefined;
      const selected: readonly CsharpSelectedCallArgument[] = call.arguments.filter(binding =>
        binding.sourceArgumentIndex === sourceIndex && binding.effectiveArgumentIndex === sourceBinding.effectiveArgumentIndex &&
        binding.sourceForm === sourceBinding.sourceForm && binding.spreadElementIndex === sourceBinding.spreadElementIndex);
      const binding = selected.length === 1 ? selected[0] : undefined;
      const parameter = binding?.targetParameter;
      if (binding === undefined || parameter === undefined || parameter !== call.targetMember.parameters[binding.targetParameterIndex] ||
        parameter.passingMode !== "by-value" || parameter.paramsArray === true || getCsharpDelegateSignature(parameter.type) === undefined) return undefined;
      if (binding.sourceForm === "value" && call.arguments.filter(argument => argument.sourceArgumentIndex === sourceIndex).length === 1) {
        if (argumentIndexes.has(sourceIndex)) return undefined;
        argumentIndexes.add(sourceIndex);
      }
    }
  }
  return Object.freeze({ ...call, ...(parameterIndexes.length === 0 ? {} : {
    invocationOnlyCallableArgumentIndexes: Object.freeze([...argumentIndexes]),
  }) });
}
