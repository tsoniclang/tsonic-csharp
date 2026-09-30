import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceCallableContract } from "../../policy/types/callables/source-callable-contract.js";
import { substituteTargetTypeParameters } from "../../policy/types/callables/substitution.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export function csharpCallableParametersEqual(
  left: CsharpSourceCallableContract, right: CsharpSourceCallableContract,
): boolean {
  return left.parameters.length === right.parameters.length && left.parameters.every((parameter, index) =>
    parameter.targetParameter.passingMode === right.parameters[index]!.targetParameter.passingMode &&
    targetTypeRefEquals(parameter.targetParameter.type, right.parameters[index]!.targetParameter.type));
}

export function instantiateCsharpInheritedCallable(
  policy: CsharpPolicyContext, source: CsharpSourceCallableContract, implementation: CsharpSourceCallableContract,
  receiver: TargetTypeRef | undefined,
): CsharpSourceCallableContract | undefined {
  if (source.methodTypeParameterIdentities.length !== implementation.methodTypeParameterIdentities.length) return undefined;
  const typeParameters = policy.ast.typeParameters(implementation.sourceDeclaration).map(parameter => parameter === undefined ? undefined
    : csharpSourceTypeParameter(parameter, policy.ast));
  if (typeParameters.length !== source.methodTypeParameterIdentities.length || typeParameters.some(parameter => parameter === undefined)) return undefined;
  const substitutions = new Map(source.methodTypeParameterIdentities.map((identity, index) => [identity, typeParameters[index]!]));
  const instantiate = (type: TargetTypeRef): TargetTypeRef | undefined => {
    const selected = policy.projectTypes.instantiateMemberType(source.sourceDeclaration, receiver, type);
    return selected.kind === "resolved" ? substituteTargetTypeParameters(selected.type, substitutions) : undefined;
  };
  const result = instantiate(source.returnType);
  const sourceReturnType = source.sourceReturnType === undefined ? undefined : instantiate(source.sourceReturnType);
  const parameters = source.parameters.map(parameter => {
    const type = instantiate(parameter.targetParameter.type);
    return type === undefined ? undefined : Object.freeze({ ...parameter, targetParameter: Object.freeze({ ...parameter.targetParameter, type }) });
  });
  return result === undefined || source.sourceReturnType !== undefined && sourceReturnType === undefined ||
    parameters.some(parameter => parameter === undefined) ? undefined : Object.freeze({
    ...source, methodTypeParameterIdentities: implementation.methodTypeParameterIdentities, returnType: result,
    ...(sourceReturnType === undefined ? {} : { sourceReturnType }),
    parameters: Object.freeze(parameters as CsharpSourceCallableContract["parameters"][number][]),
  });
}
