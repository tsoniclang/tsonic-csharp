import type { CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpStructuralObjectShapeIdentity } from "./object-shape-identity.js";
import { targetTypeRefEquals, scopedTargetTypeRefKey } from "./equality.js";
import { getCsharpDelegateSignature } from "./delegates.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";

export function csharpPresentObjectShapeMethod(member: CsharpObjectShapeMemberFact): CsharpObjectShapeMemberFact | undefined {
  if (member.memberKind !== "method") return undefined;
  const type = getCsharpNullableElementTargetType(member.type) ?? member.type;
  if (getCsharpDelegateSignature(type) === undefined) return undefined;
  const { optional: _optional, methodStorageType: _storage, ...signature } = member;
  return { ...signature, type };
}

export function csharpMethodValueType(
  owner: TargetTypeRef, method: string, identity: string, contract: TargetTypeRef, typeParameters: readonly string[],
): CsharpTargetNamedTypeRef | undefined {
  if (owner.kind !== "target-named" || csharpStructuralObjectShapeIdentity(owner) === undefined ||
      method.length === 0 || identity.length === 0 || getCsharpDelegateSignature(contract) === undefined ||
      typeParameters.some(name => name.length === 0) || new Set(typeParameters).size !== typeParameters.length) return undefined;
  const selected = owner as CsharpTargetNamedTypeRef;
  if (selected.csharpRender === undefined || selected.csharpValueType === true) return undefined;
  const allowed = new Set([...csharpFreeTypeParameterIdentities([owner]), ...typeParameters]);
  if ([...csharpFreeTypeParameterIdentities([contract])].some(identity => !allowed.has(identity))) return undefined;
  return Object.freeze({ kind: "target-named", id: `tsonic.method-value:${JSON.stringify([owner.id, identity])}`,
    ...(owner.typeArguments === undefined ? {} : { typeArguments: owner.typeArguments }),
    csharpRender: selected.csharpRender,
    csharpMethodValue: Object.freeze({ owner, method, identity, contract, typeParameters: Object.freeze([...typeParameters]) }),
  });
}

export function csharpMethodValueCoversContract(type: TargetTypeRef, contract: TargetTypeRef): boolean {
  const value = getCsharpMethodValue(type);
  return value !== undefined && targetTypeRefEquals(value.contract, contract);
}

export function csharpMethodValueContractsEqual(left: TargetTypeRef, right: TargetTypeRef): boolean {
  const source = getCsharpMethodValue(left);
  const target = getCsharpMethodValue(right);
  return source !== undefined && target !== undefined && source.identity === target.identity &&
    source.typeParameters.length === target.typeParameters.length &&
    scopedTargetTypeRefKey(source.contract, new Map(source.typeParameters.map((name, index) => [name, index]))) ===
    scopedTargetTypeRefKey(target.contract, new Map(target.typeParameters.map((name, index) => [name, index])));
}

export function getCsharpMethodValue(type: TargetTypeRef | undefined): CsharpTargetNamedTypeRef["csharpMethodValue"] {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue : undefined;
}
