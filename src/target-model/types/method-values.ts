import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpStructuralObjectShapeIdentity } from "./object-shape-identity.js";
import { targetTypeRefEquals, scopedTargetTypeRefKey } from "./equality.js";
import { csharpDelegateSignatureHasSupportedPassingModes, csharpDelegateSignaturesMatchNativeBinding, getCsharpDelegateSignature } from "./carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "./carriers/nullable.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";

export function csharpObjectShapeMethodRequiresProtocol(member: CsharpObjectShapeMemberFact): boolean {
  return member.memberKind === "method" && ((member.typeParameters?.length ?? 0) > 0 ||
    member.optional === true || member.methodValueContract !== undefined);
}

export function csharpObjectShapeMethodDeclaration(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): Node | undefined {
  const methods = shape.methodImplementation?.methods;
  if (methods === undefined || member.memberKind !== "method") return undefined;
  const declarations = methods.filter(declaration => member.sourceDeclarations?.includes(declaration));
  return declarations.length === 1 ? declarations[0] : undefined;
}

export function csharpPresentObjectShapeMethod(member: CsharpObjectShapeMemberFact): CsharpObjectShapeMemberFact | undefined {
  if (member.memberKind !== "method") return undefined;
  const type = getCsharpNullableElementTargetType(member.type) ?? member.type;
  if (getCsharpDelegateSignature(type) === undefined) return undefined;
  const { optional: _optional, methodValueStorage: _storage, ...signature } = member;
  return { ...signature, type };
}

export function csharpMethodValueType(
  owner: TargetTypeRef, method: string, identity: string, contract: TargetTypeRef, typeParameters: readonly string[],
): CsharpTargetNamedTypeRef | undefined {
  const signature = getCsharpDelegateSignature(contract);
  if (owner.kind !== "target-named" || csharpStructuralObjectShapeIdentity(owner) === undefined ||
      method.length === 0 || identity.length === 0 || signature === undefined || signature.returnType === undefined ||
      !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
      typeParameters.some(name => name.length === 0) || new Set(typeParameters).size !== typeParameters.length) return undefined;
  const selected = owner as CsharpTargetNamedTypeRef;
  if (selected.csharpRender === undefined || selected.csharpValueType === true) return undefined;
  const allowed = new Set([...csharpFreeTypeParameterIdentities([owner]), ...typeParameters]);
  if ([...csharpFreeTypeParameterIdentities([contract])].some(identity => !allowed.has(identity))) return undefined;
  return Object.freeze({ kind: "target-named", id: `tsonic.method-value:${JSON.stringify([owner.id, identity])}`,
    csharpAllowsRefLikeTypeArguments: selected.csharpAllowsRefLikeTypeArguments,
    ...(owner.typeArguments === undefined ? {} : { typeArguments: owner.typeArguments }),
    csharpRender: selected.csharpRender,
    csharpTypeofRuntimeKind: "function",
    csharpMethodValue: Object.freeze({ owner, method, identity, contract, typeParameters: Object.freeze([...typeParameters]),
      allowsRefLikeTypeArguments: Object.freeze(typeParameters.map(() => false)) }),
  });
}

export function csharpMethodValueCoversContract(type: TargetTypeRef, contract: TargetTypeRef): boolean {
  const value = getCsharpMethodValue(type);
  const expected = getCsharpMethodValue(contract);
  const sourceSignature = getCsharpDelegateSignature(value?.contract);
  const targetSignature = getCsharpDelegateSignature(expected?.contract ?? contract);
  return value !== undefined &&
    (expected === undefined || value.typeParameters.length === expected.typeParameters.length &&
      value.typeParameters.every((identity, index) => identity === expected.typeParameters[index])) &&
    targetTypeRefEquals(value.contract, expected?.contract ?? contract) && sourceSignature !== undefined && targetSignature !== undefined &&
    csharpDelegateSignaturesMatchNativeBinding(sourceSignature, targetSignature) &&
    sourceSignature.restParameterIndex === targetSignature.restParameterIndex &&
    JSON.stringify(sourceSignature.optionalParameterIndexes ?? []) === JSON.stringify(targetSignature.optionalParameterIndexes ?? []);
}

export function csharpMethodValueContractsEqual(left: TargetTypeRef, right: TargetTypeRef): boolean {
  const source = getCsharpMethodValue(left);
  const target = getCsharpMethodValue(right);
  if (source === undefined || target === undefined) return false;
  const sourceSignature = getCsharpDelegateSignature(source.contract);
  const targetSignature = getCsharpDelegateSignature(target.contract);
  if (sourceSignature === undefined || targetSignature === undefined ||
    !csharpDelegateSignatureHasSupportedPassingModes(sourceSignature) || !csharpDelegateSignatureHasSupportedPassingModes(targetSignature)) return false;
  const sourceParameters = new Map(source.typeParameters.map((name, index) => [name, index]));
  const targetParameters = new Map(target.typeParameters.map((name, index) => [name, index]));
  return source.identity === target.identity &&
    source.typeParameters.length === target.typeParameters.length &&
    source.allowsRefLikeTypeArguments.every((allowed, index) => allowed === target.allowsRefLikeTypeArguments[index]) &&
    scopedTargetTypeRefKey(source.contract, sourceParameters) === scopedTargetTypeRefKey(target.contract, targetParameters) &&
    sourceSignature.returnPassing === targetSignature.returnPassing &&
    sourceSignature.restParameterIndex === targetSignature.restParameterIndex &&
    JSON.stringify(sourceSignature.optionalParameterIndexes ?? []) === JSON.stringify(targetSignature.optionalParameterIndexes ?? []) &&
    scopedTargetTypeRefKey(sourceSignature.returnType, sourceParameters) === scopedTargetTypeRefKey(targetSignature.returnType, targetParameters) &&
    sourceSignature.parameters.length === targetSignature.parameters.length && sourceSignature.parameters.every((parameter, index) =>
      sourceSignature.parameterPassingModes[index] === targetSignature.parameterPassingModes[index] &&
      scopedTargetTypeRefKey(parameter, sourceParameters) === scopedTargetTypeRefKey(targetSignature.parameters[index]!, targetParameters));
}

export function getCsharpMethodValue(type: TargetTypeRef | undefined): CsharpTargetNamedTypeRef["csharpMethodValue"] {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue : undefined;
}
