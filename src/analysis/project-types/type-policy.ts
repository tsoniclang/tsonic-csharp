import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy, CsharpProjectMemberTypeInstantiation, CsharpProjectTypeDefinitionSelection } from "../../target-model/records/types/project-types.js";

import { csharpProjectHeritageKindIssue } from "../../policy/types/project/relationships.js";
import { csharpProviderBindingFromResolution } from "../../providers/model/relation-resolver.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeHeritage, CsharpProjectTypeIssue } from "../../target-model/records/types/project-types.js";
import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { publishedCsharpCallableInterface } from "../source-evidence/types/published-callable-interface.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import type { SourceHeritageEdge, SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTargetBindingFact } from "../../target-model/types/model.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { readCsharpSourceStruct } from "../../source/extension/markers.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { publishedCsharpClassBindings } from "../declarations/published-class-bindings.js";

import type { CsharpProjectConstructorPolicy } from "../../target-model/records/types/project-types.js";

/** Project type catalog input: authored syntax and published Source facts only (R2). */
export interface CsharpProjectTypeCatalogHost {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly sourceFiles: readonly import("@tsonic/tsts").SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
}

export interface CsharpProjectTypePolicyHost extends CsharpProjectTypeCatalogHost {
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypeQueries;
}

/** The published heritage edges of a declaration; a Host refusal is forwarded before C# analysis (I4). */
export function csharpProjectHeritageEdges(facts: SourceProgramFacts, declaration: Node): readonly SourceHeritageEdge[] {
  const heritage = facts.objects.heritage(declaration);
  return "code" in heritage ? failTargetAnalysisInvariant("tsonic-csharp",
    "Declared heritage is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", declaration) : heritage;
}

/**
 * The .NET backing width of a project enum: Int32 when every published member constant (values.literal of the member,
 * request R-F5-A3) fits Int32, otherwise Int64. Non-integer and out-of-range enums are Host refusals.
 */
function csharpEnumIntegerWidth(host: CsharpProjectTypeCatalogHost, declaration: Node): 32 | 64 {
  let width: 32 | 64 = 32;
  for (const member of host.ast.members(declaration)) {
    if (member === undefined) continue;
    const value = host.facts.values.literal(member)?.integer ?? failTargetAnalysisInvariant("tsonic-csharp",
      "A project enum member requires its published integer constant.", member);
    if (value < -2147483648n || value > 2147483647n) width = 64;
  }
  return width;
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
  const identity = host.facts.navigation.identity.identity(declaration);
  if (
    kind === undefined ||
    sourceFile === undefined ||
    name === undefined && kind !== "class" ||
    identity === undefined ||
    !host.facts.navigation.identity.isProjectDeclaration(declaration)
  ) {
    return { kind: "not-project-type" };
  }
  const enumWidth = kind === "enum" ? csharpEnumIntegerWidth(host, declaration) : undefined;
  const local = kind === "class" && !host.ast.is.IsSourceFile(host.ast.parent(declaration)!);
  if (kind === "interface") {
    if (publishedCsharpCallableInterface(declaration, host) !== undefined) return { kind: "not-project-type" };
    // An interface whose representation base is a JS array-like collection is that collection, not a project type
    // (Host analysis facts.analyses.interfaceRepresentationBase, request R-F5-B3; collection kind from the JS profile facts).
    const representation = host.facts.analyses.interfaceRepresentationBase(declaration);
    const collection = representation === undefined ? undefined : host.facts.profile.collection(representation.type);
    if (collection?.kind === "array" || collection?.kind === "readonly-array" || collection?.kind === "typed-array") return { kind: "not-project-type" };
  }
  const bindings = local ? publishedCsharpClassBindings(declaration, host) : undefined;
  if (local && bindings === undefined) return { kind: "not-project-type" };
  const outerTypeParameters = bindings?.outer ?? [];
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
      : { kind: "enum" as const, integerWidth: enumWidth }),
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
  host: Pick<CsharpProjectTypeCatalogHost, "facts">,
  declaration: Node,
): boolean {
  const construction = host.facts.objects.construction(declaration);
  if ("code" in construction) return failTargetAnalysisInvariant("tsonic-csharp",
    "Class construction is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", declaration);
  return construction.signatures.some(signature => signature.parameters.length === 0);
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
  let baseType: TargetTypeRef | undefined;
  const interfaces: TargetTypeRef[] = [];
  for (const edge of csharpProjectHeritageEdges(host.facts, definition.declaration)) {
    // The published heritage target applied to its published type arguments, represented once (I6); the source
    // profile bases (Error → System.Exception) are part of that one mapping.
    const target = host.types.represent({ kind: "declared", declaration: edge.target, typeArguments: edge.typeArguments },
      edge.heritage, "type-argument");
    if (target.kind === "csharp-refused") {
      return {
        kind: "unresolved",
        issue: { node: target.site, code: target.code, message: target.message },
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
