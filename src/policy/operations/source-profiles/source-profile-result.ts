import type { CsharpSourceProfileCallPolicyContext } from "../../model/source-profiles.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
export function resolveCsharpSourceProfileGenericResult(
  context: Pick<CsharpSourceProfileCallPolicyContext, "inputs">,
  arity: number,
  construct: (arguments_: readonly TargetTypeRef[]) => TargetTypeRef,
): TargetTypeRef | undefined {
  const selected = context.inputs.typeArguments;
  if (selected.length === 0) return context.inputs.resultType;
  if (selected.length !== arity || selected.some(argument => argument.carrier === undefined)) return undefined;
  return construct(Object.freeze(selected.map(argument => argument.carrier!)));
}
