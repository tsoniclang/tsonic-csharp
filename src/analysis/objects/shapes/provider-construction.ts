import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceTypeDescriptor, SourceTypeDescriptorMember } from "@tsonic/target-api/source";
import { AsSpreadAssignment, sourcePropertyTypeEvidenceNodes, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import { csharpTargetTypeFromBinding } from "../../../policy/types/storage/bindings.js";
import { substituteTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import type { CsharpRecursiveTypeResolver, CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
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

interface CsharpProviderObjectLiteralHost extends CsharpTypePolicyBaseHost {
  readonly typeResolver: CsharpRecursiveTypeResolver;
}

interface CsharpProviderObjectLiteralInput {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly selectedTarget: TargetTypeRef | undefined;
  readonly descriptor: SourceTypeDescriptor;
  readonly occurrence: Node;
  readonly host: CsharpProviderObjectLiteralHost;
  publishedShapeDescriptor(occurrence: Node): SourceTypeDescriptor | undefined;
  resolvePublishedProperty(
    property: TypePropertyInfo,
    descriptor: SourceTypeDescriptor,
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): { readonly member: SourceTypeDescriptorMember; readonly type: TargetTypeRef } | undefined;
}

export function resolveProviderObjectLiteralShape(
  input: CsharpProviderObjectLiteralInput,
): CsharpObjectShapeFact | undefined {
  if (input.selectedTarget?.kind !== "target-named" ||
    input.publishedShapeDescriptor(input.occurrence) !== input.descriptor) {
    return undefined;
  }
  const structure = sourceTypeDescriptorStructure(input.descriptor);
  if (structure.kind !== "shape" || structure.calls.length !== 0 ||
    structure.constructs.length !== 0) return undefined;
  if (csharpProviderObjectLiteralIndexerFailure(input.descriptor, input.occurrence, input.host) !== undefined) return undefined;
  const typeRelation = resolveProviderTypeRelation(input);
  if (typeRelation === undefined) {
    return undefined;
  }
  const typeParameters = typeRelation.targetBinding.typeParameters ?? [];
  const targetArguments = typeParameters.length === 0 ? [] : input.selectedTarget.typeArguments ?? [];
  const relatedTarget = csharpTargetTypeFromBinding(
    typeRelation.targetBinding,
    targetArguments,
  );
  if (
    relatedTarget === undefined ||
    !targetTypeRefEquals(relatedTarget, input.selectedTarget)
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
  const properties = input.queries.types.propertyInfos(input.type);
  if (properties.length !== structure.members.length) return undefined;
  const members = properties.map((property) =>
    deriveProviderObjectLiteralMember(
      property,
      typeRelation,
      substitutions,
      input,
    )
  );
  if (members.some((member) => member === undefined)) {
    return undefined;
  }
  if (structure.members.some(published => members.filter(member => member?.origins?.length === 1 &&
    sourceTypeDescriptorMemberOriginsEqual(member.origins[0]!, published.origin)).length !== 1)) return undefined;
  return {
    targetType: input.selectedTarget,
    sourceType: input.type,
    members: members as readonly CsharpObjectShapeMemberFact[],
    constructible: true,
  };
}

export function csharpProviderObjectLiteralIndexerFailure(
  descriptor: SourceTypeDescriptor,
  occurrence: Node,
  host: Pick<CsharpTypePolicyBaseHost, "ast" | "effectiveTypes">,
): string | undefined {
  const structure = sourceTypeDescriptorStructure(descriptor);
  if (structure.kind !== "shape" || structure.indexes.length === 0 || !host.ast.is.IsObjectLiteralExpression(occurrence)) return undefined;
  const outcome = host.effectiveTypes.get(occurrence);
  const correspondence = outcome === undefined || outcome.kind === "refused" ? [] : outcome.memberCorrespondence ?? [];
  const named = new Set(correspondence.filter(entry => structure.members.some(member =>
    sourceTypeDescriptorMemberOriginsEqual(member.origin, entry.origin))).map(entry => entry.property));
  const noIndexEntries = host.ast.properties(occurrence).every(property => {
    if (property === undefined) return false;
    if (named.has(property)) return true;
    if (!host.ast.is.IsSpreadAssignment(property)) return false;
    const expression = AsSpreadAssignment(host.ast, property)?.Expression;
    const spread = expression === undefined ? undefined : host.effectiveTypes.get(expression);
    if (spread === undefined || spread.kind === "refused") return false;
    let selected = sourceTypeDescriptorStructure(spread.construction ?? spread.type);
    while (selected.kind === "optional") selected = sourceTypeDescriptorStructure(selected.value);
    return selected.kind === "shape" && selected.members.length === 0 && selected.indexes.length === 0 &&
      selected.calls.length === 0 && selected.constructs.length === 0;
  });
  return noIndexEntries ? undefined : "Object-literal index entries require an exact selected C# provider indexer relation.";
}

function resolveProviderTypeRelation(
  input: CsharpProviderObjectLiteralInput,
): CsharpProviderTypeRelation | undefined {
  const targetArguments = input.selectedTarget?.kind === "target-named"
    ? input.selectedTarget.typeArguments ?? []
    : [];
  let selected: CsharpProviderTypeRelation | undefined;
  for (const subject of input.queries.facts.typeSubjects(input.type)) {
    const declaration = input.host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    );
    if (declaration === undefined) {
      continue;
    }
    const resolution = input.host.providers.resolveType(declaration);
    if (resolution.kind !== "resolved") {
      return undefined;
    }
    for (const relation of resolution.relations) {
      if (
        relation.kind === "type" &&
        relation.objectLiteralConstruction?.kind === "object-initializer"
      ) {
        const typeParameters = relation.targetBinding.typeParameters ?? [];
        const sourceArguments = typeParameters.length === 0 ? [] : targetArguments;
        const relatedTarget = typeParameters.length === sourceArguments.length
          ? csharpTargetTypeFromBinding(relation.targetBinding, sourceArguments)
          : undefined;
        if (
          relatedTarget === undefined ||
          input.selectedTarget === undefined ||
          !targetTypeRefEquals(relatedTarget, input.selectedTarget)
        ) {
          continue;
        }
        if (
          selected !== undefined &&
          !providerTypeConstructionRelationsEqual(selected, relation)
        ) {
          return undefined;
        }
        selected = relation;
      }
    }
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

function deriveProviderObjectLiteralMember(
  property: TypePropertyInfo,
  typeRelation: CsharpProviderTypeRelation,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
  input: CsharpProviderObjectLiteralInput,
): CsharpObjectShapeMemberFact | undefined {
  const selectedTarget = input.selectedTarget;
  if (selectedTarget === undefined) {
    return undefined;
  }
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
  if (sourceKey === undefined) {
    return undefined;
  }
  const relation = resolveProviderMemberRelation(
    property,
    declarations,
    typeRelation,
    input,
  );
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
  const published = input.resolvePublishedProperty(
    property,
    input.descriptor,
    input.occurrence,
    input.queries,
    input.state,
  );
  const structure = sourceTypeDescriptorStructure(input.descriptor);
  if (published === undefined || structure.kind !== "shape" || !structure.members.includes(published.member) ||
    published.member.optional !== property.optional || (published.member.readonly === true) !== property.readonly) return undefined;
  const optional = property.optional ||
    typeIncludesNullish(property.type, input.queries);
  const sourceTarget = optional ? csharpNullableTargetType(published.type) : published.type;
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
  const exactNumericStorage = memberTarget !== undefined &&
    csharpProviderSelectsNumericStorage(property, sourceTarget, memberTarget, input);
  if (
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
    origins: Object.freeze([published.member.origin]),
    sourceSubjects: Object.freeze([...new Set([
      property.symbol,
      ...property.rootSymbols,
      ...declarations,
    ])]),
    ...(declarations.length === 0
      ? {}
      : { sourceDeclarations: Object.freeze([...declarations]) }),
    sourceTypes: [property.type],
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
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  if ((sourceElement === undefined) !== (targetElement === undefined)) return false;
  const selected = targetElement ?? target;
  const defaultType = sourceElement ?? source;
  if (defaultType.kind !== "source-primitive" || defaultType.name !== "float64" ||
    selected.kind !== "source-primitive" || selected.name === "bool" || selected.name === "char") return false;
  const members = input.queries.types.isUnion(property.type)
    ? input.queries.types.unionOrIntersectionTypes(property.type).filter(type => !input.queries.types.isNullish(type))
    : [property.type];
  if (members.length === 0 || !members.every(type => input.queries.types.isNumberLike(type))) return false;
  const subjects = [...members.flatMap(type => input.queries.facts.typeSubjects(type)),
    ...sourcePropertyTypeEvidenceNodes(input.host.ast, input.queries, property),
    ...assertedInitializerTypeNodes(input.host.ast, input.queries, property)];
  return subjects.every(subject => input.host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey) === undefined);
}

function resolveProviderMemberRelation(
  property: TypePropertyInfo,
  declarations: readonly Node[],
  typeRelation: CsharpProviderTypeRelation,
  input: CsharpProviderObjectLiteralInput,
): CsharpProviderMemberRelation | undefined {
  let selected: CsharpProviderMemberRelation | undefined;
  for (const subject of [property.symbol, ...property.rootSymbols, ...declarations]) {
    const declaration = input.host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    );
    if (declaration === undefined) {
      continue;
    }
    const resolution = input.host.providers.resolveMember(declaration);
    if (resolution.kind !== "resolved") {
      return undefined;
    }
    for (const relation of resolution.relations) {
      if (
        relation.kind === "member" &&
        relation.targetBinding.id === typeRelation.targetBinding.id
      ) {
        if (
          selected !== undefined &&
          !providerMemberConstructionRelationsEqual(selected, relation)
        ) {
          return undefined;
        }
        selected = relation;
      }
    }
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

// An object-literal property has no annotation; an explicitly asserted initializer (`1 as float64`) is its authored
// type evidence, so an explicit Source primitive is never narrowed into provider numeric storage.
function assertedInitializerTypeNodes(
  ast: CsharpTypePolicyBaseHost["ast"],
  queries: SourceFileSemantics,
  property: TypePropertyInfo,
): readonly Node[] {
  const result: Node[] = [];
  for (const declaration of queries.declarations.symbolDeclarations(property.symbol)) {
    if (declaration === undefined || !ast.is.IsPropertyAssignment(declaration)) continue;
    let value = ast.as.AsPropertyAssignment(declaration)?.Initializer;
    while (value !== undefined && ast.is.IsParenthesizedExpression(value)) value = ast.as.AsParenthesizedExpression(value)?.Expression;
    if (value === undefined || !(ast.is.IsAsExpression(value) || ast.is.IsSatisfiesExpression(value) || ast.is.IsTypeAssertion(value))) continue;
    const asserted = ast.typeNode(value);
    if (asserted !== undefined) result.push(asserted);
  }
  return result;
}
