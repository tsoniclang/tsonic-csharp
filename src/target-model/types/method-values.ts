import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpStructuralObjectShapeIdentity } from "./object-shape-identity.js";
import { targetTypeRefEquals, scopedTargetTypeRefKey } from "./equality.js";
import { csharpDelegateSignatureHasSupportedPassingModes, csharpNativeCallableMemberKey, csharpNativeCallableMembersEqual, getCsharpCallableMembers } from "./carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "./carriers/nullable.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";

export function csharpObjectShapeMethodDeclaration(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): Node | undefined {
  const methods = shape.methodImplementation?.methods;
  if (methods === undefined || member.memberKind !== "method") return undefined;
  const declarations = methods.filter(declaration => member.sourceDeclarations?.includes(declaration) === true ||
    member.sourceSubjects?.includes(declaration) === true);
  return declarations.length === 1 ? declarations[0] : undefined;
}

export function csharpPresentObjectShapeMethod(member: CsharpObjectShapeMemberFact): CsharpObjectShapeMemberFact | undefined {
  if (member.memberKind !== "method") return undefined;
  const type = getCsharpNullableElementTargetType(member.type) ?? member.type;
  if (getCsharpCallableMembers(type)?.length !== member.methods.length || member.methods.length === 0) return undefined;
  const { optional: _optional, methodValueStorage: _storage, ...signature } = member;
  return { ...signature, type };
}

export function csharpMethodValueType(
  owner: TargetTypeRef, method: string, identity: string, contract: TargetTypeRef, typeParameters: readonly string[],
): CsharpTargetNamedTypeRef | undefined {
  const signatures = getCsharpCallableMembers(contract);
  if (owner.kind !== "target-named" || csharpStructuralObjectShapeIdentity(owner) === undefined ||
      method.length === 0 || identity.length === 0 || signatures === undefined || signatures.length === 0 ||
      signatures.some(member => !csharpDelegateSignatureHasSupportedPassingModes(member.signature)) ||
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
  const sourceSignatures = getCsharpCallableMembers(value?.contract);
  const targetSignatures = getCsharpCallableMembers(expected?.contract ?? contract);
  return value !== undefined &&
    (expected === undefined || value.typeParameters.length === expected.typeParameters.length &&
      value.typeParameters.every((identity, index) => identity === expected.typeParameters[index])) &&
    targetTypeRefEquals(value.contract, expected?.contract ?? contract) && sourceSignatures !== undefined && targetSignatures !== undefined &&
    csharpNativeCallableMembersEqual(sourceSignatures, targetSignatures);
}

export function csharpMethodValueContractsEqual(left: TargetTypeRef, right: TargetTypeRef): boolean {
  const source = getCsharpMethodValue(left);
  const target = getCsharpMethodValue(right);
  if (source === undefined || target === undefined) return false;
  const sourceSignatures = getCsharpCallableMembers(source.contract);
  const targetSignatures = getCsharpCallableMembers(target.contract);
  if (sourceSignatures === undefined || targetSignatures === undefined || sourceSignatures.length !== targetSignatures.length ||
    sourceSignatures.some(member => !csharpDelegateSignatureHasSupportedPassingModes(member.signature)) ||
    targetSignatures.some(member => !csharpDelegateSignatureHasSupportedPassingModes(member.signature))) return false;
  const sourceParameters = new Map(source.typeParameters.map((name, index) => [name, index]));
  const targetParameters = new Map(target.typeParameters.map((name, index) => [name, index]));
  return source.identity === target.identity &&
    source.typeParameters.length === target.typeParameters.length &&
    source.allowsRefLikeTypeArguments.every((allowed, index) => allowed === target.allowsRefLikeTypeArguments[index]) &&
    scopedTargetTypeRefKey(source.contract, sourceParameters) === scopedTargetTypeRefKey(target.contract, targetParameters) &&
    sourceSignatures.every((member, index) => csharpNativeCallableMemberKey(member, sourceParameters) ===
      csharpNativeCallableMemberKey(targetSignatures[index]!, targetParameters));
}

export function getCsharpMethodValue(type: TargetTypeRef | undefined): CsharpTargetNamedTypeRef["csharpMethodValue"] {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue : undefined;
}
