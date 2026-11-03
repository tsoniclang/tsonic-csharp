import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, Type, TypePropertyInfo } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { sourcePropertyTypeEvidenceNodes } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import { csharpTargetTypeFromBinding } from "../../../policy/types/storage/bindings.js";
import { substituteTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import type { CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpStructuralPropertyApplication } from "../../source-evidence/types/resolution/structural-applications.js";
import { formCsharpObjectShapePropertySource } from "./member-evidence.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourceMemberDisplayName } from "../../../target-model/types/source-member-keys.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";
import { typeIncludesNullish } from "./source-evidence.js";

type CsharpProviderTypeRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "type" }
>;

type CsharpProviderMemberRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "member" }
>;

interface CsharpProviderObjectLiteralSourceInput {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
  readonly host: CsharpTypePolicyBaseHost;
}

export interface CsharpProviderObjectLiteralPropertyRequest {
  readonly property: TypePropertyInfo;
  readonly propertyType: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
}

export interface CsharpProviderObjectLiteralPropertyDependency {
  readonly request: CsharpProviderObjectLiteralPropertyRequest;
  readonly application: CsharpStructuralPropertyApplication;
}

interface CsharpProviderObjectLiteralMemberSource {
  readonly dependency: CsharpProviderObjectLiteralPropertyDependency;
  readonly declarations: readonly Node[];
  readonly subjects: readonly ExtensionFactSubject[];
  readonly sourceTypes: readonly Type[];
  readonly sourceKey: ReturnType<typeof resolveObjectShapeSourceMemberKey>;
  readonly relations: readonly CsharpProviderMemberRelation[] | undefined;
  readonly optional: boolean;
  readonly implicitNumericStorage: boolean;
}

export interface CsharpProviderObjectLiteralSource {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
  readonly authoredTypeRoot: Node | undefined;
  readonly typeSubjects: readonly ExtensionFactSubject[];
  readonly hasConstructionRelation: boolean;
  readonly relations: readonly CsharpProviderTypeRelation[] | undefined;
  readonly members: readonly CsharpProviderObjectLiteralMemberSource[];
}

export interface CsharpCompletedProviderObjectLiteralProperty extends CsharpProviderObjectLiteralPropertyDependency {
  readonly type: TargetTypeRef | undefined;
}

export type CsharpProviderObjectLiteralCompletion = Generator<CsharpProviderObjectLiteralPropertyDependency,
  CsharpObjectShapeFact | undefined, CsharpCompletedProviderObjectLiteralProperty>;

export function formProviderObjectLiteralSource(
  input: CsharpProviderObjectLiteralSourceInput,
): CsharpProviderObjectLiteralSource | undefined {
  const typeSubjects = Object.freeze([...input.queries.facts.typeSubjects(input.type)]);
  const relations: CsharpProviderTypeRelation[] = [];
  let provider = false;
  let available = true;
  for (const subject of typeSubjects) {
    const declaration = input.host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
    if (declaration === undefined) continue;
    provider = true;
    const resolution = input.host.providers.resolveType(declaration);
    if (resolution.kind !== "resolved") {
      available = false;
      continue;
    }
    for (const relation of resolution.relations) {
      if (relation.kind === "type" && relation.objectLiteralConstruction?.kind === "object-initializer") {
        relations.push(relation);
      }
    }
  }
  if (!provider) return undefined;
  const members = available && relations.length !== 0
    ? input.queries.types.propertyInfos(input.type).map(property => formProviderObjectLiteralMemberSource(property, input))
    : [];
  return Object.freeze({ type: input.type, queries: input.queries, sourceFile: input.queries.sourceFile,
    state: input.state, authoredTypeRoot: input.authoredTypeRoot, typeSubjects,
    hasConstructionRelation: relations.length !== 0,
    relations: available ? Object.freeze(relations) : undefined, members: Object.freeze(members) });
}

export function* resolveProviderObjectLiteralShape(
  source: CsharpProviderObjectLiteralSource,
  selectedTarget: TargetTypeRef | undefined,
): CsharpProviderObjectLiteralCompletion {
  if (selectedTarget?.kind !== "target-named") return undefined;
  const typeRelation = resolveProviderTypeRelation(source, selectedTarget);
  if (typeRelation === undefined) {
    return undefined;
  }
  const typeParameters = typeRelation.targetBinding.typeParameters ?? [];
  const targetArguments = typeParameters.length === 0 ? [] : selectedTarget.typeArguments ?? [];
  const relatedTarget = csharpTargetTypeFromBinding(
    typeRelation.targetBinding,
    targetArguments,
  );
  if (
    relatedTarget === undefined ||
    !targetTypeRefEquals(relatedTarget, selectedTarget)
  ) {
    return undefined;
  }
  if (typeParameters.length !== targetArguments.length) {
    return undefined;
  }
  const substitutions = new Map(
    typeParameters.map((parameter, index) => [
      parameter.identity,
      targetArguments[index]!,
    ]),
  );
  const members: (CsharpObjectShapeMemberFact | undefined)[] = [];
  for (const member of source.members) {
    members.push(yield* deriveProviderObjectLiteralMember(member, typeRelation, substitutions, selectedTarget));
  }
  if (members.some((member) => member === undefined)) {
    return undefined;
  }
  return {
    targetType: selectedTarget,
    sourceType: source.type,
    members: members as readonly CsharpObjectShapeMemberFact[],
    constructible: true,
  };
}

function resolveProviderTypeRelation(
  source: CsharpProviderObjectLiteralSource,
  selectedTarget: TargetTypeRef,
): CsharpProviderTypeRelation | undefined {
  const targetArguments = selectedTarget.kind === "target-named"
    ? selectedTarget.typeArguments ?? []
    : [];
  let selected: CsharpProviderTypeRelation | undefined;
  if (source.relations === undefined) return undefined;
  for (const relation of source.relations) {
    const typeParameters = relation.targetBinding.typeParameters ?? [];
    const sourceArguments = typeParameters.length === 0 ? [] : targetArguments;
    const relatedTarget = typeParameters.length === sourceArguments.length
      ? csharpTargetTypeFromBinding(relation.targetBinding, sourceArguments)
      : undefined;
    if (relatedTarget === undefined || !targetTypeRefEquals(relatedTarget, selectedTarget)) continue;
    if (selected !== undefined && !providerTypeConstructionRelationsEqual(selected, relation)) return undefined;
    selected = relation;
  }
  return selected;
}

function providerTypeConstructionRelationsEqual(
  left: CsharpProviderTypeRelation,
  right: CsharpProviderTypeRelation,
): boolean {
  return canonicalProviderValue({
    targetBinding: left.targetBinding,
    bindingTypeParameters: left.bindingTypeParameters,
    objectLiteralConstruction: left.objectLiteralConstruction,
  }) === canonicalProviderValue({
    targetBinding: right.targetBinding,
    bindingTypeParameters: right.bindingTypeParameters,
    objectLiteralConstruction: right.objectLiteralConstruction,
  });
}

function formProviderObjectLiteralMemberSource(
  property: TypePropertyInfo,
  input: CsharpProviderObjectLiteralSourceInput,
): CsharpProviderObjectLiteralMemberSource {
  const declarations = [...new Set([
    ...input.queries.declarations.symbolDeclarations(property.symbol),
    ...property.rootSymbols.flatMap((symbol) =>
      input.queries.declarations.symbolDeclarations(symbol)
    ),
  ])].filter((declaration): declaration is Node => declaration !== undefined);
  const sourceKey = resolveObjectShapeSourceMemberKey(
    declarations,
    property.name,
    input.host.ast,
    input.host.semanticsFor,
  );
  const subjects = Object.freeze([...new Set([property.symbol, ...property.rootSymbols, ...declarations])]);
  const relations: CsharpProviderMemberRelation[] = [];
  let available = true;
  for (const subject of subjects) {
    const declaration = input.host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey);
    if (declaration === undefined) continue;
    const resolution = input.host.providers.resolveMember(declaration);
    if (resolution.kind !== "resolved") {
      available = false;
      break;
    }
    for (const relation of resolution.relations) if (relation.kind === "member") relations.push(relation);
  }
  const request = Object.freeze({ property, propertyType: property.type, queries: input.queries,
    state: input.state, authoredTypeRoot: input.authoredTypeRoot });
  const application = formCsharpObjectShapePropertySource(input.host, property, property.type,
    input.queries, input.state, input.authoredTypeRoot);
  return Object.freeze({ dependency: Object.freeze({ request, application }), declarations: Object.freeze(declarations),
    sourceTypes: Object.freeze([property.type]),
    subjects, sourceKey, relations: available ? Object.freeze(relations) : undefined,
    optional: property.optional || typeIncludesNullish(property.type, input.queries),
    implicitNumericStorage: providerPropertyHasImplicitNumericStorage(property, input) });
}

function* deriveProviderObjectLiteralMember(
  source: CsharpProviderObjectLiteralMemberSource,
  typeRelation: CsharpProviderTypeRelation,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
  selectedTarget: TargetTypeRef,
): Generator<CsharpProviderObjectLiteralPropertyDependency,
  CsharpObjectShapeMemberFact | undefined, CsharpCompletedProviderObjectLiteralProperty> {
  const { sourceKey } = source;
  if (sourceKey === undefined) return undefined;
  const property = source.dependency.request.property;
  const relation = resolveProviderMemberRelation(source, typeRelation);
  if (
    relation === undefined ||
    (
      relation.targetMember.kind !== "property" &&
      relation.targetMember.kind !== "field"
    ) ||
    relation.source.memberStatic ||
    relation.targetMember.static === true ||
    relation.receiver.kind !== "instance" ||
    relation.targetMember.parameters.length !== 0
  ) {
    return undefined;
  }
  const sourceMemberKey = relation.source.memberKey;
  const sourceMemberMatches = sourceMemberKey.kind === "property-key"
    ? sourceKey.kind === "property" && sourceKey.name === sourceMemberKey.name
    : sourceKey.kind === "well-known-symbol" &&
      sourceKey.symbol === sourceMemberKey.name;
  if (!sourceMemberMatches) {
    return undefined;
  }
  const completed = yield source.dependency;
  if (completed.request !== source.dependency.request || completed.application !== source.dependency.application) {
    failTargetAnalysisInvariant("tsonic-csharp", "Provider construction requires its exact ordered property application.",
      source.dependency.request.authoredTypeRoot);
  }
  const rawSourceTarget = completed.type;
  const optional = source.optional;
  const sourceTarget = rawSourceTarget === undefined
    ? undefined
    : optional
      ? csharpNullableTargetType(rawSourceTarget)
      : rawSourceTarget;
  const memberTarget = relation.targetMember.returnType === undefined
    ? undefined
    : substituteTargetTypeParameters(
        relation.targetMember.returnType,
        substitutions,
      );
  const declaringTarget = relation.targetMember.declaringType === undefined
    ? undefined
    : substituteTargetTypeParameters(
        relation.targetMember.declaringType,
        substitutions,
      );
  const targetReadonly = relation.targetMember.readonly === true;
  const exactNumericStorage = sourceTarget !== undefined && memberTarget !== undefined &&
    providerNumericStoragePairMatches(sourceTarget, memberTarget) && source.implicitNumericStorage;
  if (
    sourceTarget === undefined ||
    memberTarget === undefined ||
    declaringTarget === undefined ||
    (!targetTypeRefEquals(sourceTarget, memberTarget) &&
      !exactNumericStorage) ||
    !targetTypeRefEquals(declaringTarget, selectedTarget) ||
    targetReadonly !== property.readonly
  ) {
    return undefined;
  }
  return {
    sourceKey,
    sourceName: csharpSourceMemberDisplayName(sourceKey),
    sourceSubjects: source.subjects,
    ...(source.declarations.length === 0
      ? {}
      : { sourceDeclarations: source.declarations }),
    sourceTypes: source.sourceTypes,
    targetName: relation.targetMember.targetName,
    memberKind: "property",
    type: memberTarget,
    ...(exactNumericStorage ? { exactNumericStorage: true as const } : {}),
    ...(optional ? { optional: true } : {}),
    ...(property.readonly ? { readonly: true } : {}),
  };
}

export function csharpProviderSelectsNumericStorage(
  property: TypePropertyInfo,
  source: TargetTypeRef,
  target: TargetTypeRef,
  input: {
    readonly queries: SourceFileSemantics;
    readonly host: Pick<CsharpTypePolicyBaseHost, "ast" | "sourceFacts">;
  },
): boolean {
  return providerNumericStoragePairMatches(source, target) && providerPropertyHasImplicitNumericStorage(property, input);
}

function providerNumericStoragePairMatches(source: TargetTypeRef, target: TargetTypeRef): boolean {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if ((sourceElement === undefined) !== (targetElement === undefined)) return false;
  const selected = targetElement ?? target;
  const defaultType = sourceElement ?? source;
  if (defaultType.kind !== "source-primitive" || defaultType.name !== "float64" ||
    selected.kind !== "source-primitive" || selected.name === "bool" || selected.name === "char") return false;
  return true;
}

function providerPropertyHasImplicitNumericStorage(
  property: TypePropertyInfo,
  input: {
    readonly queries: SourceFileSemantics;
    readonly host: Pick<CsharpTypePolicyBaseHost, "ast" | "sourceFacts">;
  },
): boolean {
  const members = input.queries.types.isUnion(property.type)
    ? input.queries.types.unionOrIntersectionTypes(property.type).filter(type => !input.queries.types.isNullish(type))
    : [property.type];
  if (members.length === 0 || !members.every(type => input.queries.types.isNumberLike(type))) return false;
  const subjects = [...members.flatMap(type => input.queries.facts.typeSubjects(type)),
    ...sourcePropertyTypeEvidenceNodes(input.host.ast, input.queries, property)];
  return subjects.every(subject => input.host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey) === undefined);
}

function resolveProviderMemberRelation(
  source: CsharpProviderObjectLiteralMemberSource,
  typeRelation: CsharpProviderTypeRelation,
): CsharpProviderMemberRelation | undefined {
  let selected: CsharpProviderMemberRelation | undefined;
  if (source.relations === undefined) return undefined;
  for (const relation of source.relations) {
    if (relation.targetBinding.id !== typeRelation.targetBinding.id) continue;
    if (selected !== undefined && !providerMemberConstructionRelationsEqual(selected, relation)) return undefined;
    selected = relation;
  }
  return selected;
}

function providerMemberConstructionRelationsEqual(
  left: CsharpProviderMemberRelation,
  right: CsharpProviderMemberRelation,
): boolean {
  return canonicalProviderValue({
    sourceMemberKey: left.source.memberKey,
    targetBinding: left.targetBinding,
    targetMember: left.targetMember,
    receiver: left.receiver,
    bindingTypeParameters: left.bindingTypeParameters,
    bindingTypeArgumentSource: left.bindingTypeArgumentSource,
  }) === canonicalProviderValue({
    sourceMemberKey: right.source.memberKey,
    targetBinding: right.targetBinding,
    targetMember: right.targetMember,
    receiver: right.receiver,
    bindingTypeParameters: right.bindingTypeParameters,
    bindingTypeArgumentSource: right.bindingTypeArgumentSource,
  });
}
