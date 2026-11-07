
import { getCsharpDelegateSignature } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfileCallPolicyContext } from "../../../model/source-profiles.js";

import type { CsharpSelectedTargetCall, CsharpSelectedCallArgument } from "../../../../target-model/records/objects/members.js";

export function sealInvocationOnlyCallableArguments(
  context: Pick<CsharpSourceProfileCallPolicyContext, "source" | "identity" | "host">,
  call: CsharpSelectedTargetCall,
): CsharpSelectedTargetCall | undefined {
  if (call.origin !== "source-profile") return undefined;
  // JS meaning (facts.profile, D18): the parameters whose callback arguments the member invokes only synchronously
  // during the call, never stored or deferred (the JS profile's per-parameter invocation table, as at baseline).
  const identity = context.identity;
  const parameterIndexes = identity.owner !== "js" || identity.kind !== "member" ? []
    : context.host.facts.profile.invocationOnlyParameters(identity.declaration);
  const argumentIndexes = new Set<number>();
  for (const parameterIndex of parameterIndexes) {
    const bindings = context.source.bindings.filter(binding => binding.parameterIndex === parameterIndex);
    if (bindings.length === 0 && context.source.parameters[parameterIndex] !== undefined &&
      context.source.parameters[parameterIndex]?.kind === "required") return undefined;
    for (const sourceBinding of bindings) {
      const sourceIndex = sourceBinding.argumentIndex;
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= context.source.arguments.length ||
        context.source.arguments[sourceIndex] === undefined) return undefined;
      const selected: readonly CsharpSelectedCallArgument[] = call.arguments.filter(binding =>
        binding.sourceArgumentIndex === sourceIndex && binding.effectiveArgumentIndex === sourceBinding.effectiveIndex &&
        binding.sourceForm === sourceBinding.form && binding.spreadElementIndex === sourceBinding.spreadElement);
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
