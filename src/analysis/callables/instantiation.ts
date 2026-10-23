import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceCallableSourceContract } from "../../target-model/records/source-callable-contract.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { createCsharpMetadataBudget } from "../../target-model/metadata/immutable.js";

export function csharpCallableParametersEqual(
  left: CsharpSourceCallableSourceContract, right: CsharpSourceCallableSourceContract,
): boolean {
  return left.nativeParameters.length === right.nativeParameters.length && left.nativeParameters.every((parameter, index) =>
    parameter.targetParameter.passingMode === right.nativeParameters[index]!.targetParameter.passingMode &&
    targetTypeRefEquals(parameter.targetParameter.type, right.nativeParameters[index]!.targetParameter.type));
}

export function instantiateCsharpInheritedCallable(
  policy: Pick<CsharpPolicyContext, "ast" | "projectTypes">, source: CsharpSourceCallableSourceContract, implementation: CsharpSourceCallableSourceContract,
  receiver: TargetTypeRef | undefined,
): CsharpSourceCallableSourceContract | undefined {
  if (source.methodTypeParameterIdentities.length !== implementation.methodTypeParameterIdentities.length) return undefined;
  const substitutions = new Map<string, TargetTypeRef>();
  if (source.sourceDeclaration === implementation.sourceDeclaration) {
    if (source.methodTypeParameterIdentities.some((identity, index) => identity !== implementation.methodTypeParameterIdentities[index])) return undefined;
  } else {
    const authored = (contract: CsharpSourceCallableSourceContract) => policy.ast.typeParameters(contract.sourceDeclaration)
      .map(parameter => parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast));
    const sourceParameters = authored(source);
    const implementationParameters = authored(implementation);
    if (sourceParameters.length !== implementationParameters.length ||
      sourceParameters.some((parameter, index) => parameter === undefined || parameter.identity !== source.methodTypeParameterIdentities[index]) ||
      implementationParameters.some((parameter, index) => parameter === undefined || parameter.identity !== implementation.methodTypeParameterIdentities[index])) return undefined;
    const selected = new Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
    const pending = [implementation.returnType, ...implementation.nativeParameters.map(parameter => parameter.targetParameter.type),
      ...(implementation.sourceReturnType === undefined ? [] : [implementation.sourceReturnType])];
    const visited = new Set<TargetTypeRef>();
    const budget = createCsharpMetadataBudget();
    budget.reserve(pending.length);
    for (let index = 0; index < pending.length; index += 1) {
      const type = pending[index]!;
      if (visited.has(type)) continue;
      visited.add(type);
      const element = getCsharpNullableElementTargetType(type) ?? type;
      if (element.kind === "type-parameter" && selected.get(element.identity)?.csharpConstraints === undefined) selected.set(element.identity, element);
      const components = csharpTargetTypeComponents(type);
      budget.reserve(components.length);
      pending.push(...components);
    }
    for (const [index, parameter] of sourceParameters.entries()) {
      const target = implementationParameters[index]!;
      substitutions.set(parameter!.identity, selected.get(target.identity) ?? target);
    }
  }
  const instantiate = (type: TargetTypeRef): TargetTypeRef | undefined => {
    const selected = policy.projectTypes.instantiateMemberType(source.sourceDeclaration, receiver, type);
    return selected.kind === "resolved" ? substituteTargetTypeParameters(selected.type, substitutions) : undefined;
  };
  const result = instantiate(source.returnType);
  const sourceReturnType = source.sourceReturnType === undefined ? undefined : instantiate(source.sourceReturnType);
  const nativeParameters: CsharpSourceCallableSourceContract["nativeParameters"][number][] = [];
  for (const parameter of source.nativeParameters) {
    const type = instantiate(parameter.targetParameter.type);
    if (type === undefined) return undefined;
    nativeParameters.push(Object.freeze({ ...parameter, targetParameter: Object.freeze({ ...parameter.targetParameter, type }) }));
  }
  return result === undefined || source.sourceReturnType !== undefined && sourceReturnType === undefined ? undefined : Object.freeze({
    ...source, methodTypeParameterIdentities: implementation.methodTypeParameterIdentities,
    methodAllowsRefLikeTypeArguments: implementation.methodAllowsRefLikeTypeArguments, returnType: result,
    ...(sourceReturnType === undefined ? {} : { sourceReturnType }),
    nativeParameters: Object.freeze(nativeParameters),
  });
}
