import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpStructuralObjectShapeIdentity } from "./object-shape-identity.js";
import { targetTypeRefEquals, scopedTargetTypeRefKey } from "./equality.js";
import { getCsharpDelegateSignature } from "./delegates.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";
import { substituteTargetTypeParameters } from "./substitution.js";

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
    csharpTypeofRuntimeKind: "function",
    csharpMethodValue: Object.freeze({ owner, method, identity, contract, typeParameters: Object.freeze([...typeParameters]) }),
  });
}

export function csharpMethodValueCoversContract(type: TargetTypeRef, contract: TargetTypeRef): boolean {
  const value = getCsharpMethodValue(type);
  const expected = getCsharpMethodValue(contract);
  return value !== undefined &&
    (expected === undefined || value.typeParameters.length === expected.typeParameters.length) &&
    targetTypeRefEquals(value.contract, expected?.contract ?? contract);
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

export function rebindCsharpMethodValueTypeParameters(
  type: TargetTypeRef, parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[],
): TargetTypeRef | undefined {
  const value = getCsharpMethodValue(type);
  if (value === undefined || value.typeParameters.length !== parameters.length) return undefined;
  const substitutions = new Map(value.typeParameters.map((identity, index) => [identity, parameters[index]!]));
  return csharpMethodValueType(value.owner, value.method, value.identity,
    substituteTargetTypeParameters(value.contract, substitutions), parameters.map(parameter => parameter.identity));
}
