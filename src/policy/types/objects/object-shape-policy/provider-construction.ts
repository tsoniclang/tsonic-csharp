import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type {
  Node,
  Type,
  TypePropertyInfo,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpProviderTargetRelation,
} from "../../../../providers/relations/index.js";
import { canonicalProviderValue } from "../../../../providers/model/canonical-value.js";
import {
  csharpTargetTypeFromBinding,
} from "../../storage/bindings.js";
import {
  substituteTargetTypeParameters,
} from "../../callables/substitution.js";
import type {
  CsharpRecursiveTypeResolver,
  CsharpTypePolicyBaseHost,
  CsharpTypeResolutionState,
} from "../../resolution/model.js";
import {
  csharpNullableTargetType,
} from "../../../../target-model/types/nullable.js";
import {
  targetTypeRefEquals,
} from "../../../../target-model/types/equality.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "../../../../target-model/types/model.js";
import {
  csharpSourceMemberDisplayName,
} from "../../../../target-model/types/source-member-keys.js";
import { resolveObjectShapeSourceMemberKey } from "./source-member-identity.js";
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
  readonly authoredTypeRoot: Node | undefined;
  readonly host: CsharpProviderObjectLiteralHost;
  resolvePropertyType(
    property: TypePropertyInfo,
    sourceType: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
  ): TargetTypeRef | undefined;
}

export function resolveProviderObjectLiteralShape(
  input: CsharpProviderObjectLiteralInput,
): CsharpObjectShapeFact | undefined {
  if (input.selectedTarget?.kind !== "target-named") {
    return undefined;
  }
  const typeRelation = resolveProviderTypeRelation(input);
  if (typeRelation === undefined) {
    return undefined;
  }
  const targetArguments = input.selectedTarget.typeArguments ?? [];
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
  const typeParameters = typeRelation.targetBinding.typeParameters ?? [];
  if (typeParameters.length !== targetArguments.length) {
    return undefined;
  }
  const substitutions = new Map(
    typeParameters.map((parameter, index) => [
      parameter.name,
      targetArguments[index]!,
    ]),
  );
  const members = input.queries.types.propertyInfos(input.type).map((property) =>
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
  return {
    targetType: input.selectedTarget,
    members: members as readonly CsharpObjectShapeMemberFact[],
    constructible: true,
  };
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
        const relatedTarget = typeParameters.length === targetArguments.length
          ? csharpTargetTypeFromBinding(relation.targetBinding, targetArguments)
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
    input.queries,
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
    )
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
  const rawSourceTarget = input.resolvePropertyType(
    property,
    property.type,
    input.queries,
    input.state,
    input.authoredTypeRoot,
  );
  const optional = property.optional ||
    typeIncludesNullish(property.type, input.queries);
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
  if (
    sourceTarget === undefined ||
    memberTarget === undefined ||
    declaringTarget === undefined ||
    !targetTypeRefEquals(sourceTarget, memberTarget) ||
    !targetTypeRefEquals(declaringTarget, selectedTarget) ||
    targetReadonly !== property.readonly
  ) {
    return undefined;
  }
  return {
    sourceKey,
    sourceName: csharpSourceMemberDisplayName(sourceKey),
    sourceSubjects: [property.symbol, ...declarations],
    ...(declarations.length === 0
      ? {}
      : { sourceDeclarations: Object.freeze([...declarations]) }),
    sourceTypes: [property.type],
    targetName: relation.targetMember.targetName,
    memberKind: "property",
    type: memberTarget,
    ...(optional ? { optional: true } : {}),
    ...(property.readonly ? { readonly: true } : {}),
  };
}

function resolveProviderMemberRelation(
  property: TypePropertyInfo,
  declarations: readonly Node[],
  typeRelation: CsharpProviderTypeRelation,
  input: CsharpProviderObjectLiteralInput,
): CsharpProviderMemberRelation | undefined {
  let selected: CsharpProviderMemberRelation | undefined;
  for (const subject of [property.symbol, ...declarations]) {
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
