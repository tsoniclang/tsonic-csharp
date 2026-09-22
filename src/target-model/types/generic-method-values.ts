import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpStructuralObjectShapeIdentity } from "./object-shape-identity.js";
import { targetTypeRefEquals, scopedTargetTypeRefKey } from "./equality.js";
import { getCsharpDelegateSignature } from "./delegates.js";

export function csharpGenericMethodValueType(
  owner: TargetTypeRef, method: string, identity: string, contract: TargetTypeRef, typeParameters: readonly string[],
): CsharpTargetNamedTypeRef | undefined {
  if (owner.kind !== "target-named" || csharpStructuralObjectShapeIdentity(owner) === undefined ||
      method.length === 0 || identity.length === 0 || getCsharpDelegateSignature(contract) === undefined || typeParameters.length === 0 ||
      typeParameters.some(name => name.length === 0) || new Set(typeParameters).size !== typeParameters.length) return undefined;
  const selected = owner as CsharpTargetNamedTypeRef;
  if (selected.csharpRender === undefined || selected.csharpValueType === true) return undefined;
  return Object.freeze({ kind: "target-named", id: `tsonic.method-value:${JSON.stringify([owner.id, identity])}`,
    ...(owner.typeArguments === undefined ? {} : { typeArguments: owner.typeArguments }),
    csharpRender: selected.csharpRender,
    csharpGenericMethodValue: Object.freeze({ owner, method, identity, contract, typeParameters: Object.freeze([...typeParameters]) }),
  });
}

export function csharpGenericMethodValueCoversContract(type: TargetTypeRef, contract: TargetTypeRef): boolean {
  const value = getCsharpGenericMethodValue(type);
  return value !== undefined && targetTypeRefEquals(value.contract, contract);
}

export function csharpGenericMethodValueContractsEqual(left: TargetTypeRef, right: TargetTypeRef): boolean {
  const source = getCsharpGenericMethodValue(left);
  const target = getCsharpGenericMethodValue(right);
  return source !== undefined && target !== undefined && source.identity === target.identity &&
    source.typeParameters.length === target.typeParameters.length &&
    scopedTargetTypeRefKey(source.contract, new Map(source.typeParameters.map((name, index) => [name, index]))) ===
    scopedTargetTypeRefKey(target.contract, new Map(target.typeParameters.map((name, index) => [name, index])));
}

export function getCsharpGenericMethodValue(type: TargetTypeRef | undefined): CsharpTargetNamedTypeRef["csharpGenericMethodValue"] {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpGenericMethodValue : undefined;
}
