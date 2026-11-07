// The .NET object shape of a CLR provider type that an object initializer constructs (nextgen C-2542, G8, I2, I6).
// Inputs: the Host members of the descriptor (facts.objects.members, Host order and declarations), the provider-virtual
// declaration fact of the type declaration and of each member declaration (providers.resolveType / resolveMember: the
// CLR type and field bindings), and the one representation of each member's Host type, which must equal the CLR member
// type exactly. No checker Type, property info or root symbol is read, and no member is matched by name search.
// Every missing, contradictory or unrelated relation is one CSHARP_PROVIDER_CONSTRUCTION refusal at the occurrence; a
// Host refusal of the member inventory is forwarded unchanged (R5).
import { providerVirtualDeclarationFactKey, type AstReader, type Node, type ReadonlySourceFactResolver } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceObjectMember, type SourceProgramFacts, type SourceRefusal,
  type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpTargetTypeFromBinding } from "../../../policy/types/storage/bindings.js";
import { substituteTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import { csharpRefusal, isCsharpRefusal, type CsharpRefusal, type CsharpRepresentation } from "../../../representation/index.js";

type CsharpProviderTypeRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "type" }>;
type CsharpProviderMemberRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "member" }>;

export const csharpProviderConstructionRefusalCode = "CSHARP_PROVIDER_CONSTRUCTION";

export interface CsharpProviderObjectShapeInput {
  readonly facts: SourceProgramFacts;
  readonly syntax: AstReader;
  readonly sourceFacts: ReadonlySourceFactResolver | undefined;
  readonly providers: Pick<CsharpProviderRelationResolver, "resolveType" | "resolveMember">;
  /** The one descriptor -> .NET mapping (storage position) at the occurrence. */
  represent(type: SourceTypeDescriptor, occurrence: Node): CsharpRepresentation;
}

/**
 * The object-initializer shape of the provider type `descriptor` (a `declared` reference, optional lifted) whose CLR
 * type is `carrier`. Members are the Host's instance members of that descriptor, each bound to its one CLR field or
 * property on the same binding.
 */
export function representCsharpProviderObjectShape(
  input: CsharpProviderObjectShapeInput,
  descriptor: SourceTypeDescriptor,
  occurrence: Node,
  carrier: TargetTypeRef,
): CsharpObjectShapeFact | CsharpRefusal | SourceRefusal {
  const refuse = (message: string): CsharpRefusal => csharpRefusal(csharpProviderConstructionRefusalCode, message, occurrence);
  const declared = descriptor.kind === "optional" ? descriptor.value : descriptor;
  if (declared.kind !== "declared") return refuse("Provider object construction requires a declared provider type.");
  if (carrier.kind !== "target-named") return refuse("Provider object construction requires a named CLR type.");
  const typeRelation = providerTypeRelation(input, declared.declaration, carrier);
  if (typeof typeRelation === "string") return refuse(typeRelation);
  const typeParameters = typeRelation.targetBinding.typeParameters ?? [];
  const carrierArguments = carrier.typeArguments ?? [];
  const substitutions = new Map(typeParameters.map((parameter, index) => [parameter.identity, carrierArguments[index]!]));
  const structure = sourceTypeDescriptorStructure(declared);
  if (structure.kind === "shape" && (structure.calls.length !== 0 || structure.constructs.length !== 0)) {
    return refuse("A provider type with call or construct signatures has no object-initializer construction.");
  }
  const published = input.facts.objects.members(declared);
  if (!Array.isArray(published)) return published as SourceRefusal;
  const instance = (published as readonly SourceObjectMember[]).filter(member => !member.static);
  const names = new Set<string>();
  const members: CsharpObjectShapeMemberFact[] = [];
  for (const member of instance) {
    if (member.name.length === 0 || names.has(member.name)) {
      return refuse(`Provider type member inventory is ambiguous at '${member.name}'; the Host must list each member once.`);
    }
    names.add(member.name);
    if (member.kind !== "property" || member.key.kind !== "string") {
      return refuse(`Provider member '${member.name}' is not a property; an object initializer assigns fields and properties only.`);
    }
    const relation = providerMemberRelation(input, member, typeRelation);
    if (typeof relation === "string") return refuse(relation);
    const target = relation.targetMember;
    if (target.kind !== "field" && target.kind !== "property" || target.static === true || relation.source.memberStatic ||
      relation.receiver.kind !== "instance" || target.parameters.length !== 0) {
      return refuse(`Provider member '${member.name}' is not an instance field or property without parameters.`);
    }
    if (relation.source.memberKey.kind !== "property-key" || relation.source.memberKey.name !== member.name) {
      return refuse(`Provider member '${member.name}' is bound to a CLR member of another Source member.`);
    }
    if (target.readonly === true) return refuse(`CLR member '${target.targetName}' is read-only; an object initializer cannot assign it.`);
    const memberType = target.returnType === undefined ? undefined : substituteTargetTypeParameters(target.returnType, substitutions);
    const declaringType = target.declaringType === undefined ? undefined : substituteTargetTypeParameters(target.declaringType, substitutions);
    if (memberType === undefined || declaringType === undefined || !targetTypeRefEquals(declaringType, carrier)) {
      return refuse(`CLR member '${target.targetName}' does not declare its type on '${carrier.id}'.`);
    }
    const represented = input.represent(member.type, occurrence);
    if (isCsharpRefusal(represented)) return represented;
    const sourceTarget = member.optional && getCsharpNullableElementTargetType(represented) === undefined
      ? csharpNullableTargetType(represented) : represented;
    if (!targetTypeRefEquals(sourceTarget, memberType)) {
      return refuse(`Provider member '${member.name}' is not stored exactly by CLR member '${target.targetName}' (different .NET type${member.optional ? " or absence" : ""}).`);
    }
    const origin = structure.kind === "shape" ? structure.members.find(candidate => candidate.name === member.name)?.origin : undefined;
    const declarations = Object.freeze([...member.declarations]);
    members.push(Object.freeze({
      sourceKey: Object.freeze({ kind: "property" as const, name: member.name }),
      sourceName: member.name,
      ...(origin === undefined ? {} : { origins: Object.freeze([origin]) }),
      sourceSubjects: declarations,
      sourceDeclarations: declarations,
      targetName: target.targetName,
      memberKind: "property" as const,
      type: memberType,
      ...(member.optional ? { optional: true } : {}),
      ...(member.readonly ? { readonly: true } : {}),
    }));
  }
  return Object.freeze({ targetType: carrier, members: Object.freeze(members), constructible: true });
}

/** Whether a declaration is a provider type that declares object-initializer construction (applicability only). */
export function isCsharpProviderObjectInitializerType(
  input: Pick<CsharpProviderObjectShapeInput, "sourceFacts" | "providers">,
  declaration: Node,
): boolean {
  const fact = input.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
  if (fact === undefined) return false;
  const resolution = input.providers.resolveType(fact);
  return resolution.kind === "resolved" && resolution.relations.some(relation =>
    relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer");
}

/** The one object-initializer type relation of the declaration whose CLR type is the carrier, or why there is none. */
function providerTypeRelation(input: CsharpProviderObjectShapeInput, declaration: Node,
  carrier: Extract<TargetTypeRef, { readonly kind: "target-named" }>): CsharpProviderTypeRelation | string {
  const fact = input.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
  if (fact === undefined) return "The provider type declaration has no provider declaration fact.";
  const resolution = input.providers.resolveType(fact);
  if (resolution.kind !== "resolved") return `The provider type has no CLR type relation (${resolution.kind}).`;
  const carrierArguments = carrier.typeArguments ?? [];
  const selected = resolution.relations.filter((relation): relation is CsharpProviderTypeRelation => {
    if (relation.kind !== "type" || relation.objectLiteralConstruction?.kind !== "object-initializer") return false;
    const arity = relation.targetBinding.typeParameters?.length ?? 0;
    const related = arity === carrierArguments.length
      ? csharpTargetTypeFromBinding(relation.targetBinding, arity === 0 ? [] : carrierArguments) : undefined;
    return related !== undefined && targetTypeRefEquals(related, carrier);
  });
  if (selected.length === 0) return `The provider type has no object-initializer construction for CLR type '${carrier.id}'.`;
  if (selected.length === 1) return selected[0]!;
  const keys = new Set(selected.map(relation => canonicalProviderValue({ targetBinding: relation.targetBinding,
    bindingTypeParameters: relation.bindingTypeParameters, objectLiteralConstruction: relation.objectLiteralConstruction })));
  return keys.size === 1 ? selected[0]! : "The provider type has contradictory object-initializer constructions.";
}

/** The one CLR member relation of a Host member (first declaration with a provider fact) on the type's binding. */
function providerMemberRelation(input: CsharpProviderObjectShapeInput, member: SourceObjectMember,
  typeRelation: CsharpProviderTypeRelation): CsharpProviderMemberRelation | string {
  const declaration = member.declarations.find(candidate =>
    input.sourceFacts?.getFact(candidate, providerVirtualDeclarationFactKey) !== undefined);
  const fact = declaration === undefined ? undefined : input.sourceFacts?.getFact(declaration, providerVirtualDeclarationFactKey);
  if (fact === undefined) return `Provider member '${member.name}' has no provider declaration fact.`;
  const resolution = input.providers.resolveMember(fact);
  if (resolution.kind !== "resolved") return `Provider member '${member.name}' has no CLR member relation (${resolution.kind}).`;
  const selected = resolution.relations.filter((relation): relation is CsharpProviderMemberRelation =>
    relation.kind === "member" && relation.targetBinding.id === typeRelation.targetBinding.id);
  if (selected.length === 0) return `Provider member '${member.name}' has no CLR member on the constructed type.`;
  if (selected.length === 1) return selected[0]!;
  const keys = new Set(selected.map(memberRelationKey));
  return keys.size === 1 ? selected[0]! : `Provider member '${member.name}' has contradictory CLR member bindings.`;
}

function memberRelationKey(relation: CsharpProviderMemberRelation): string {
  return canonicalProviderValue({
    sourceMemberKey: relation.source.memberKey,
    targetBinding: relation.targetBinding,
    targetMember: relation.targetMember,
    receiver: relation.receiver,
    bindingTypeParameters: relation.bindingTypeParameters,
    bindingTypeArgumentSource: relation.bindingTypeArgumentSource,
  });
}
