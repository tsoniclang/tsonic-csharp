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
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpPropertySourceMemberKey, csharpSourceMemberDisplayName, csharpSourceMemberKeyParts, csharpSourceMemberKeysEqual,
  csharpWellKnownSymbolKind, csharpWellKnownSymbolSourceMemberKey } from "../../../target-model/types/source-member-keys.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { descriptorMemberOf } from "../../../representation/objects.js";
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
    // The member key is the Host member key (RC2 #3): a string or numeric key, or a unique-symbol key whose Host
    // property-name fact is a well-known symbol (baseline matched well-known-symbol provider members, R11).
    const sourceKey = providerSourceMemberKey(input, member);
    if (typeof sourceKey === "string") return refuse(sourceKey);
    const identity = csharpSourceMemberKeyParts(sourceKey).join(":");
    if (names.has(identity)) {
      return refuse(`Provider type member inventory is ambiguous at '${member.name}'; the Host must list each member once.`);
    }
    names.add(identity);
    if (member.kind !== "property") {
      return refuse(`Provider member '${member.name}' is not a property; an object initializer assigns fields and properties only.`);
    }
    const relation = providerMemberRelation(input, member, typeRelation);
    if (typeof relation === "string") return refuse(relation);
    const target = relation.targetMember;
    if (target.kind !== "field" && target.kind !== "property" || target.static === true || relation.source.memberStatic ||
      relation.receiver.kind !== "instance" || target.parameters.length !== 0) {
      return refuse(`Provider member '${member.name}' is not an instance field or property without parameters.`);
    }
    const relationKey = relation.source.memberKey;
    const bound = relationKey.kind === "property-key" ? csharpPropertySourceMemberKey(relationKey.name)
      : csharpWellKnownSymbolSourceMemberKey(csharpWellKnownSymbolKind(relationKey.name));
    if (!csharpSourceMemberKeysEqual(bound, sourceKey)) {
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
    // The Host origin of the member is the origin of the descriptor member it was published from (RC2 #4): matched by
    // Host member identity (declaration, mapped key, prototype owner), never by a name search. A published provider
    // member always has one; a missing one is a Host producer defect (I4).
    if (structure.kind !== "shape") return failTargetAnalysisInvariant("tsonic-csharp",
      "A provider type with published members must have a published shape definition.", occurrence);
    const origin = descriptorMemberOf(structure, member, member.declarations[0] ?? occurrence).origin;
    const declarations = Object.freeze([...member.declarations]);
    members.push(Object.freeze({
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      origins: Object.freeze([origin]),
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

/**
 * The C# member key of a Host provider member, from its Host member key: a string key is its value, a numeric key its
 * canonical string; a unique-symbol key is the well-known symbol that the Host property-name fact
 * (`facts.analyses.propertyName`) publishes for every declaration name of the member. Anything else is the refusal message.
 */
function providerSourceMemberKey(input: CsharpProviderObjectShapeInput, member: SourceObjectMember): CsharpSourceMemberKey | string {
  if (member.key.kind === "string") return csharpPropertySourceMemberKey(member.key.value);
  if (member.key.kind === "number") return csharpPropertySourceMemberKey(String(member.key.value));
  const symbols = member.declarations.map(declaration => {
    const name = input.syntax.name(declaration);
    const selected = name === undefined ? undefined : input.facts.analyses.propertyName(name);
    return selected?.kind === "well-known-symbol" ? selected.symbol : undefined;
  });
  const [first] = symbols;
  return first !== undefined && symbols.every(symbol => symbol === first)
    ? csharpWellKnownSymbolSourceMemberKey(csharpWellKnownSymbolKind(first))
    : `Provider member '${member.name}' has a symbol key that is not one well-known symbol; .NET binds well-known symbols only.`;
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
