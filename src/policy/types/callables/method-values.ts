import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { substituteTargetTypeParameters } from "../resolution/substitution.js";
import { getCsharpMethodValue, csharpMethodValueType } from "../../../target-model/types/method-values.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { csharpProjectedType, csharpTypeProjection } from "../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../target-model/types/generic-constraints.js";
import { visitCsharpTargetTypeParameters } from "../../../target-model/types/generic-references.js";
import { csharpTypeParameterConstraintsEqual } from "../../constraints/type-parameter-constraints.js";

type NativeQuantifier = Extract<TargetTypeRef, { readonly kind: "type-parameter" }> & {
  readonly csharpConstraints: Extract<CsharpTypeParameterConstraintResolution, { readonly kind: "resolved" }>;
};

export function selectCsharpNativeQuantifierArguments(
  sourceParameters: readonly NativeQuantifier[],
  targetParameters: readonly NativeQuantifier[],
): readonly NativeQuantifier[] | undefined {
  if (sourceParameters.length !== targetParameters.length ||
    sourceParameters.some(parameter => parameter.identity.length === 0 || parameter.csharpConstraints.kind !== "resolved") ||
    targetParameters.some(parameter => parameter.identity.length === 0 || parameter.csharpConstraints.kind !== "resolved") ||
    new Set(sourceParameters.map(parameter => parameter.identity)).size !== sourceParameters.length ||
    new Set(targetParameters.map(parameter => parameter.identity)).size !== targetParameters.length) return undefined;
  const authoredSource = sourceParameters.filter(parameter => csharpTypeProjection(parameter) === undefined);
  const authoredTarget = targetParameters.filter(parameter => csharpTypeProjection(parameter) === undefined);
  if (authoredSource.length !== authoredTarget.length) return undefined;
  const substitutions = new Map<string, NativeQuantifier>(authoredSource.map((parameter, index) =>
    [parameter.identity, authoredTarget[index]!]));
  const selectedTargets = new Set(authoredTarget.map(parameter => parameter.identity));
  const sourceByIdentity = new Map(sourceParameters.map(parameter => [parameter.identity, parameter]));
  const resolving = new Set<string>();
  for (const parameter of sourceParameters) if (selectParameter(parameter) === undefined) return undefined;
  if (selectedTargets.size !== targetParameters.length) return undefined;
  return Object.freeze(sourceParameters.map(parameter => substitutions.get(parameter.identity)!));

  function selectParameter(parameter: NativeQuantifier): NativeQuantifier | undefined {
    const existing = substitutions.get(parameter.identity);
    if (existing !== undefined) return existing;
    if (resolving.has(parameter.identity)) return undefined;
    const projection = csharpTypeProjection(parameter)?.csharpProjection;
    if (projection === undefined) return undefined;
    resolving.add(parameter.identity);
    let complete = true;
    for (const argument of projection.arguments) visitCsharpTargetTypeParameters(argument, dependency => {
      const source = sourceByIdentity.get(dependency.identity);
      if (source !== undefined && selectParameter(source) === undefined) complete = false;
    });
    resolving.delete(parameter.identity);
    if (!complete) return undefined;
    const normalized = projection.kind === "optional" ? csharpProjectedType({ ...projection,
      arguments: [substituteTargetTypeParameters(projection.arguments[0], substitutions)] })
      : csharpProjectedType({ ...projection,
        arguments: projection.arguments.map(argument => substituteTargetTypeParameters(argument, substitutions)) });
    const candidates = targetParameters.filter(target => csharpTypeProjection(target) !== undefined &&
      targetTypeRefEquals(normalized, target));
    if (candidates.length !== 1 || selectedTargets.has(candidates[0]!.identity)) return undefined;
    substitutions.set(parameter.identity, candidates[0]!);
    selectedTargets.add(candidates[0]!.identity);
    return candidates[0];
  }
}

export function rebindCsharpMethodValueTypeParameters(
  type: TargetTypeRef,
  sourceParameters: readonly NativeQuantifier[],
  targetParameters: readonly NativeQuantifier[],
): TargetTypeRef | undefined {
  if (sourceParameters === undefined || targetParameters === undefined) {
    throw new TypeError("Native callable rebinding requires both complete source and target quantifier vectors.");
  }
  const value = getCsharpMethodValue(type);
  const signature = value?.contract ?? type;
  if (getCsharpDelegateSignature(signature) === undefined || value !== undefined &&
    (value.typeParameters.length !== sourceParameters.length ||
      value.typeParameters.some((identity, index) => identity !== sourceParameters[index]!.identity) ||
      value.allowsRefLikeTypeArguments.length !== sourceParameters.length)) return undefined;
  const arguments_ = selectCsharpNativeQuantifierArguments(sourceParameters, targetParameters);
  if (arguments_ === undefined) return undefined;
  const substitutions = new Map(sourceParameters.map((parameter, index) => [parameter.identity, arguments_[index]!]));
  for (const parameter of sourceParameters) {
    const target = substitutions.get(parameter.identity)!;
    const constraints = parameter.csharpConstraints.constraints.map(constraint => constraint.kind === "type"
      ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, substitutions) } : constraint);
    if (!csharpTypeParameterConstraintsEqual(constraints, target.csharpConstraints.constraints)) return undefined;
  }
  const rebound = substituteTargetTypeParameters(signature, substitutions);
  if (value === undefined) return rebound;
  const selected = csharpMethodValueType(value.owner, value.method, value.identity, rebound,
    targetParameters.map(parameter => parameter.identity));
  if (selected?.csharpMethodValue === undefined) return undefined;
  const permissions = new Map(sourceParameters.map((parameter, index) =>
    [substitutions.get(parameter.identity)!.identity, value.allowsRefLikeTypeArguments[index]!]));
  return Object.freeze({ ...selected, csharpMethodValue: Object.freeze({ ...selected.csharpMethodValue,
    allowsRefLikeTypeArguments: Object.freeze(targetParameters.map(parameter => permissions.get(parameter.identity)!)) }) });
}
