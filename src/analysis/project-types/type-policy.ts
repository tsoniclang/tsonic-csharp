import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy, CsharpProjectMemberTypeInstantiation, CsharpProjectTypeDefinitionSelection } from "../../target-model/records/project-types.js";

import { csharpProjectHeritageKindIssue } from "../../policy/types/project/relationships.js";
import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeHeritage, CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceNodeIdentity, sourceCallableInterface } from "@tsonic/target-api/source";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import type { SourceEnumConstantIndex, SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTargetBindingFact } from "../../target-model/types/model.js";
import type { CsharpTypePolicy } from "../types/resolution/model.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { readCsharpSourceStruct } from "../../policy/types/resolution/source-markers.js";
import { resolveCsharpSourceProfileBaseType } from "../../policy/types/resolution/source-profiles.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

import type { CsharpProjectConstructorPolicy } from "../../target-model/records/project-types.js";

export interface CsharpProjectTypeCatalogHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly enumConstants: SourceEnumConstantIndex;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  semanticsFor(node: Node): SourceFileSemantics;
}

export interface CsharpProjectTypePolicyHost
  extends Omit<CsharpProjectTypeCatalogHost, "enumConstants"> {
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly types: CsharpTypePolicy;
}

export function createCsharpProjectTypePolicy(
  ast: AstReader,
  catalog: CsharpProjectTypeCatalog,
  heritageById: ReadonlyMap<string, CsharpProjectTypeHeritage>,
  constructors: CsharpProjectConstructorPolicy,
  issues: readonly CsharpProjectTypeIssue[],
): CsharpProjectTypePolicy {
  if (heritageById === undefined || constructors === undefined || issues === undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "C# project type policy requires completed heritage, constructors and issues.");
  }
  const directSupertypes = (
    type: TargetTypeRef,
  ): readonly TargetTypeRef[] | undefined => {
    const definition = catalog.definitionForTarget(type);
    if (definition === undefined) {
      return undefined;
    }
    const arguments_ = type.kind === "target-named"
      ? type.typeArguments ?? []
      : [];
    if (arguments_.length !== definition.typeParameterBindings.length) {
      return Object.freeze([]);
    }
    const heritage = heritageById.get(definition.id);
    if (heritage === undefined) {
      return Object.freeze([]);
    }
    const substitutions = new Map(
      definition.typeParameterBindings.map((parameter, index) => [
        parameter.identity,
        arguments_[index]!,
      ]),
    );
    return Object.freeze([
      ...(heritage.baseType === undefined
        ? []
        : [substituteTargetTypeParameters(
            heritage.baseType,
            substitutions,
          )]),
      ...heritage.interfaces.map((candidate) =>
        substituteTargetTypeParameters(candidate, substitutions)
      ),
    ]);
  };

  const instantiateDeclarationType = (
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    declaredType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation => {
    const owner = catalog.definitionForDeclaration(declaration);
    if (owner === undefined) {
      return { kind: "not-project-member" };
    }
    if (owner.typeParameterBindings.length === 0) {
      return { kind: "resolved", type: declaredType };
    }
    if (receiver === undefined) {
      return {
        kind: "unresolved",
        reason:
          `Project declaration '${owner.sourceName}' requires an exact receiver target type to instantiate its type parameters.`,
      };
    }
    const pending: TargetTypeRef[] = [receiver];
    const visited = new Set<string>();
    const matches = new Map<string, TargetTypeRef>();
    while (pending.length > 0) {
      const candidate = pending.shift()!;
      const key = targetTypeRefKey(candidate);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      const definition = catalog.definitionForTarget(candidate);
      if (definition?.id === owner.id) {
        matches.set(key, candidate);
        continue;
      }
      pending.push(...(directSupertypes(candidate) ?? []));
    }
    if (matches.size !== 1) {
      return {
        kind: "unresolved",
        reason: matches.size === 0
          ? `The selected receiver has no exact target heritage path to project declaration '${owner.sourceName}'.`
          : `The selected receiver has more than one target instantiation of project declaration '${owner.sourceName}'.`,
      };
    }
    const selectedOwner = [...matches.values()][0]!;
    const arguments_ = selectedOwner.kind === "target-named"
      ? selectedOwner.typeArguments ?? []
      : [];
    if (arguments_.length !== owner.typeParameterBindings.length) {
      return {
        kind: "unresolved",
        reason:
          `The selected receiver instantiates project declaration '${owner.sourceName}' with ${arguments_.length} target type arguments instead of ${owner.typeParameterBindings.length}.`,
      };
    }
    const bindings = new Map(owner.typeParameterBindings.map((parameter, index) => [parameter.identity, arguments_[index]!]));
    let missingProjection = false;
    visitCsharpTargetTypeParameters(declaredType, parameter => {
      const projection = parameter.csharpProjection;
      if (projection === undefined || bindings.has(parameter.identity)) return;
      const dependencies = csharpFreeTypeParameterIdentities(projection.arguments);
      if (owner.typeParameterBindings.some(binding => dependencies.has(binding.identity))) missingProjection = true;
    });
    if (missingProjection) {
      return { kind: "unresolved", reason: "The selected project owner has not finalized every required generic projection binding." };
    }
    return {
      kind: "resolved",
      type: substituteTargetTypeParameters(
        declaredType,
        bindings,
      ),
    };
  };

  return Object.freeze({
    catalog,
    issues,
    heritageForDeclaration(declaration: Node) {
      const definition = catalog.definitionForDeclaration(declaration);
      return definition === undefined
        ? undefined
        : heritageById.get(definition.id);
    },
    directSupertypes,
    instantiateDeclarationType,
    instantiateMemberType(
      declaration: Node | undefined,
      receiver: TargetTypeRef | undefined,
      memberType: TargetTypeRef,
    ): CsharpProjectMemberTypeInstantiation {
      const owner = projectMemberOwner(ast, catalog, declaration);
      if (owner === undefined) {
        return { kind: "not-project-member" };
      }
      if (declaration !== undefined && ast.hasModifierKind(declaration, "static") && owner.outerTypeParameters.length === 0) {
        const parameters = csharpFreeTypeParameterIdentities([memberType]);
        return owner.typeParameterBindings.some(parameter => parameters.has(parameter.identity))
          ? { kind: "unresolved", reason: "A static member cannot depend on its class instance type parameters." }
          : { kind: "resolved", type: memberType };
      }
      return instantiateDeclarationType(
        owner.declaration,
        receiver,
        memberType,
      );
    },
    implicitConstructorsForDeclaration:
      constructors.implicitConstructorsForDeclaration,
    implicitConstructorForSignature:
      constructors.implicitConstructorForSignature,
  });
}

function projectMemberOwner(
  ast: AstReader,
  catalog: CsharpProjectTypeCatalog,
  declaration: Node | undefined,
): CsharpProjectTypeDefinition | undefined {
  const member = declaration !== undefined &&
      ast.is.IsParameterDeclaration(declaration)
    ? ast.parent(declaration)
    : declaration;
  if (
    member === undefined ||
    !(
      ast.is.IsMethodDeclaration(member) ||
      ast.is.IsMethodSignatureDeclaration(member) ||
      ast.is.IsPropertyDeclaration(member) ||
      ast.is.IsPropertySignatureDeclaration(member) ||
      ast.is.IsGetAccessorDeclaration(member) ||
      ast.is.IsSetAccessorDeclaration(member) ||
      ast.is.IsConstructorDeclaration(member) ||
      ast.is.IsCallSignatureDeclaration(member) ||
      ast.is.IsConstructSignatureDeclaration(member) ||
      ast.is.IsIndexSignatureDeclaration(member)
    )
  ) {
    return undefined;
  }
  return catalog.definitionForDeclaration(ast.parent(member));
}

export function projectTypeDefinition(
  host: CsharpProjectTypeCatalogHost,
  declaration: Node,
): CsharpProjectTypeDefinitionSelection {
  const kind = declarationKind(host, declaration);
  const sourceFile = host.ast.getSourceFile(declaration);
  const name = host.ast.name(declaration);
  const identity = sourceNodeIdentity(host.ast, declaration);
  if (
    kind === undefined ||
    sourceFile === undefined ||
    name === undefined && kind !== "class" ||
    identity === undefined ||
    !host.navigation.isProjectDeclaration(declaration)
  ) {
    return { kind: "not-project-type" };
  }
  const enumWidth = kind === "enum" ? host.enumConstants.integerWidth(declaration) : undefined;
  if (kind === "enum" && enumWidth === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked source enum requires its completed common integer-width decision.", declaration);
  if (enumWidth?.kind === "rejected") return { kind: "rejected", selection: enumWidth };
  const local = kind === "class" && !host.ast.is.IsSourceFile(host.ast.parent(declaration)!);
  const semantics = host.semanticsFor(declaration);
  if (kind === "interface" && sourceCallableInterface(semantics.declarations.declaredType(declaration), semantics, host.ast) !== undefined) return { kind: "not-project-type" };
  const declaredType = local ? semantics.declarations.declaredType(declaration) : undefined;
  if (local && declaredType === undefined) return { kind: "not-project-type" };
  const bindings = declaredType === undefined ? undefined : semantics.types.typeArgumentBindings(declaredType);
  if (declaredType !== undefined && semantics.types.isTypeReference(declaredType) && bindings === undefined) return { kind: "not-project-type" };
  const outerTypeParameters = bindings?.filter(binding => binding.scope === "outer").map(binding => binding.declaration) ?? [];
  const rawTypeParameters = kind === "enum" || kind === "struct"
    ? []
    : host.ast.typeParameters(declaration);
  const typeParameters = rawTypeParameters.filter(
    (parameter): parameter is Node => parameter !== undefined,
  );
  const typeParameterBindings = [...outerTypeParameters, ...typeParameters].map((parameter) =>
    csharpSourceTypeParameter(parameter, host.ast)
  );
  if (
    typeParameters.length !== rawTypeParameters.length ||
    typeParameterBindings.some((parameter) => parameter === undefined)
  ) {
    return { kind: "not-project-type" };
  }
  const definition = Object.freeze({
    id: `tsonic.source:${identity}`,
    declaration,
    sourceFile,
    sourceName: name === undefined ? "AnonymousClass" : host.ast.text(name),
    local,
    ...(enumWidth === undefined ? { kind: kind as "class" | "interface" | "struct" }
      : { kind: "enum" as const, integerWidth: enumWidth.integerWidth }),
    sourceTypeParameterCount: typeParameters.length,
    typeProjections: Object.freeze([]),
    outerTypeProjections: Object.freeze([]),
    outerTypeParameters: Object.freeze(outerTypeParameters),
    typeParameters: Object.freeze(typeParameters),
    staticCompanion: kind === "class" && typeParameterBindings.length > 0 &&
      host.ast.is.IsSourceFile(host.ast.parent(declaration)!) && host.ast.members(declaration).some(member =>
        member !== undefined && (host.ast.hasModifierKind(member, "static") || host.ast.is.IsClassStaticBlockDeclaration(member))),
    typeParameterBindings: Object.freeze(
      typeParameterBindings as readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[],
    ),
    abstract:
      kind === "class" && host.ast.hasModifierKind(declaration, "abstract"),
    publicParameterlessConstructor:
      kind === "struct" ||
      kind === "class" && projectClassHasParameterlessConstructor(
        host,
        declaration,
      ),
  });
  return { kind: "resolved", definition };
}

function projectClassHasParameterlessConstructor(
  host: Pick<CsharpProjectTypeCatalogHost, "navigation">,
  declaration: Node,
): boolean {
  const constructors = host.navigation.classConstructors(declaration);
  return constructors.kind === "resolved" &&
    constructors.signatures.some((signature) =>
      signature.parameters.length === 0);
}

export function selectCsharpProjectTypeHeritage(
  host: CsharpProjectTypePolicyHost,
  catalog: CsharpProjectTypeCatalog,
  definition: CsharpProjectTypeDefinition,
):
  | { readonly kind: "resolved"; readonly heritage: CsharpProjectTypeHeritage }
  | { readonly kind: "unresolved"; readonly issue: CsharpProjectTypeIssue } {
  if (definition.kind === "struct") {
    return {
      kind: "resolved",
      heritage: Object.freeze({
        definition,
        interfaces: Object.freeze([]),
      }),
    };
  }
  const source = host.navigation.declaredHeritage(definition.declaration);
  if (source.kind === "unresolved") {
    return {
      kind: "unresolved",
      issue: {
        node: source.heritage,
        code: "CSHARP_PROJECT_HERITAGE_SOURCE_UNRESOLVED",
        message: source.reason,
      },
    };
  }
  let baseType: TargetTypeRef | undefined;
  const interfaces: TargetTypeRef[] = [];
  for (const edge of source.edges) {
    if (edge.typeArguments.length > edge.selectedTypeArguments.length) {
      return {
        kind: "unresolved",
        issue: {
          node: edge.heritage,
          code: "CSHARP_PROJECT_HERITAGE_TYPE_ARGUMENTS_UNRESOLVED",
          message:
            `Declared ${edge.kind} heritage for '${definition.sourceName}' has more authored type arguments than the checked source selection.`,
        },
      };
    }
    const profileBase = definition.kind === "class" && edge.kind === "extends"
      ? resolveCsharpSourceProfileBaseType(edge.selectedType, host.semanticsFor(edge.heritage), host.ast)
      : undefined;
    const target = profileBase ?? host.types.resolveSelectedType(
      edge.heritage,
      edge.selectedType,
      definition.sourceFile,
    );
    if (target === undefined) {
      return {
        kind: "unresolved",
        issue: {
          node: edge.heritage,
          code: "CSHARP_PROJECT_HERITAGE_TARGET_UNRESOLVED",
          message:
            `Declared ${edge.kind} heritage for '${definition.sourceName}' has no closed C# target type.`,
        },
      };
    }
    const targetKind = targetDeclarationKind(host, catalog, target);
    const kindError = csharpProjectHeritageKindIssue(definition, edge.kind, targetKind, target);
    if (kindError !== undefined) {
      return {
        kind: "unresolved",
        issue: {
          node: edge.heritage,
          code: "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED",
          message: kindError,
        },
      };
    }
    if (definition.kind === "class" && edge.kind === "extends") {
      if (baseType !== undefined) {
        return {
          kind: "unresolved",
          issue: {
            node: edge.heritage,
            code: "CSHARP_PROJECT_MULTIPLE_BASE_TYPES",
            message:
              `Project class '${definition.sourceName}' has more than one selected C# base class.`,
          },
        };
      }
      baseType = target;
    } else {
      interfaces.push(target);
    }
  }
  return {
    kind: "resolved",
    heritage: Object.freeze({
      definition,
      ...(baseType === undefined ? {} : { baseType }),
      interfaces: Object.freeze(interfaces),
    }),
  };
}

function targetDeclarationKind(
  host: CsharpProjectTypePolicyHost,
  catalog: CsharpProjectTypeCatalog,
  type: TargetTypeRef,
): CsharpProjectTypeDefinition["kind"] | undefined {
  const project = catalog.definitionForTarget(type);
  if (project !== undefined) {
    return project.kind;
  }
  if (type.kind !== "target-named") {
    return undefined;
  }
  const binding = csharpTargetBindingFact(
    csharpProviderBindingFromResolution(host.providers.findTargetBindingByTargetId(type.id, "ordinary")),
  );
  return binding?.kind === "class"
    ? "class"
    : binding?.kind === "interface"
      ? "interface"
      : binding?.kind === "enum"
        ? "enum"
        : binding?.kind === "struct"
          ? "struct"
          : (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind;
}

function declarationKind(
  host: CsharpProjectTypeCatalogHost,
  declaration: Node,
): CsharpProjectTypeDefinition["kind"] | undefined {
  const ast = host.ast;
  return ast.is.IsClassDeclaration(declaration) || ast.is.IsClassExpression(declaration)
    ? "class"
    : ast.is.IsInterfaceDeclaration(declaration)
      ? "interface"
      : ast.is.IsEnumDeclaration(declaration)
        ? "enum"
        : ast.is.IsVariableDeclaration(declaration) &&
            readCsharpSourceStruct(host.sourceFacts, declaration)?.valueType === true
          ? "struct"
        : undefined;
}
