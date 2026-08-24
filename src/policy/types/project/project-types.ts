import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpTargetBindingFact,
} from "../../../target-model/types/model.js";
import type {
  CsharpTypePolicy,
} from "../resolution/index.js";
import {
  substituteTargetTypeParameters,
} from "../callables/substitution.js";
import { readCsharpSourceStruct } from "../resolution/source-markers.js";
import {
  targetTypeRefKey,
} from "../../../target-model/types/equality.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";
import type {
  CsharpProjectConstructorPolicy,
  CsharpProjectForwardingConstructor,
} from "./project-type-constructors.js";
import {
  createCsharpProjectConstructorPolicy,
} from "./project-type-constructors.js";

export interface CsharpProjectTypeIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

export interface CsharpProjectTypeDefinition {
  readonly id: string;
  readonly declaration: Node;
  readonly sourceFile: SourceFile;
  readonly sourceName: string;
  readonly kind: "class" | "interface" | "enum" | "struct";
  readonly typeParameterNames: readonly string[];
}

export interface CsharpProjectTypeCatalog {
  readonly definitions: readonly CsharpProjectTypeDefinition[];
  readonly issues: readonly CsharpProjectTypeIssue[];
  definitionForDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  definitionContainingDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  definitionForTarget(
    type: TargetTypeRef | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  targetTypeForDeclaration(
    declaration: Node | undefined,
    typeArguments: readonly TargetTypeRef[],
  ): CsharpTargetNamedTypeRef | undefined;
}

export interface CsharpProjectTypeHeritage {
  readonly definition: CsharpProjectTypeDefinition;
  readonly baseType?: TargetTypeRef;
  readonly interfaces: readonly TargetTypeRef[];
}

export interface CsharpProjectTypePolicy {
  readonly catalog: CsharpProjectTypeCatalog;
  readonly issues: readonly CsharpProjectTypeIssue[];
  heritageForDeclaration(
    declaration: Node,
  ): CsharpProjectTypeHeritage | undefined;
  directSupertypes(
    type: TargetTypeRef,
  ): readonly TargetTypeRef[] | undefined;
  instantiateDeclarationType(
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    declaredType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation;
  instantiateMemberType(
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    memberType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation;
  implicitConstructorsForDeclaration(
    declaration: Node,
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
  implicitConstructorForSignature(
    declaration: Node,
    signature: import("@tsonic/tsts").Signature,
  ): CsharpProjectForwardingConstructor | undefined;
}

export type CsharpProjectMemberTypeInstantiation =
  | { readonly kind: "not-project-member" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "unresolved"; readonly reason: string };

export interface CsharpProjectTypeCatalogHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly sourceFacts?: ReadonlySourceFactResolver;
}

export interface CsharpProjectTypePolicyHost
  extends CsharpProjectTypeCatalogHost {
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly types: CsharpTypePolicy;
}

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
): CsharpProjectTypeCatalog {
  const definitions: CsharpProjectTypeDefinition[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const byId = new Map<string, CsharpProjectTypeDefinition>();

  for (const sourceFile of host.navigation.sourceFiles) {
    visitSourceTree(host.ast, sourceFile, (declaration) => {
      const definition = projectTypeDefinition(host, declaration);
      if (definition === undefined) {
        return;
      }
      const existing = byId.get(definition.id);
      if (existing !== undefined && existing.declaration !== declaration) {
        issues.push({
          node: declaration,
          code: "CSHARP_PROJECT_TYPE_IDENTITY_CONFLICT",
          message:
            `Project declarations '${existing.sourceName}' and '${definition.sourceName}' produced the same canonical source identity '${definition.id}'.`,
        });
        return;
      }
      definitions.push(definition);
      byDeclaration.set(declaration, definition);
      byId.set(definition.id, definition);
    });
  }

  const frozenDefinitions = Object.freeze(definitions);
  const frozenIssues = Object.freeze(issues);
  return Object.freeze({
    definitions: frozenDefinitions,
    issues: frozenIssues,
    definitionForDeclaration(declaration: Node | undefined) {
      return declaration === undefined ? undefined : byDeclaration.get(declaration);
    },
    definitionContainingDeclaration(declaration: Node | undefined) {
      let current = declaration;
      while (current !== undefined) {
        const definition = byDeclaration.get(current);
        if (definition !== undefined) {
          return definition;
        }
        current = host.ast.parent(current);
      }
      return undefined;
    },
    definitionForTarget(type: TargetTypeRef | undefined) {
      return type?.kind === "target-named" ? byId.get(type.id) : undefined;
    },
    targetTypeForDeclaration(
      declaration: Node | undefined,
      typeArguments: readonly TargetTypeRef[],
    ) {
      const definition = declaration === undefined
        ? undefined
        : byDeclaration.get(declaration);
      return definition === undefined ||
          typeArguments.length !== definition.typeParameterNames.length
        ? undefined
        : projectDefinitionTargetType(definition, typeArguments);
    },
  });
}

export function createCsharpProjectTypePolicy(
  host: CsharpProjectTypePolicyHost,
  catalog: CsharpProjectTypeCatalog,
): CsharpProjectTypePolicy {
  const issues: CsharpProjectTypeIssue[] = [...catalog.issues];
  const heritageById = new Map<string, CsharpProjectTypeHeritage>();

  for (const definition of catalog.definitions) {
    const heritage = resolveDefinitionHeritage(host, catalog, definition);
    if (heritage.kind === "resolved") {
      heritageById.set(definition.id, heritage.heritage);
    } else {
      issues.push(heritage.issue);
    }
  }

  const constructors: CsharpProjectConstructorPolicy =
    createCsharpProjectConstructorPolicy(
      {
        ast: host.ast,
        navigation: host.navigation,
        providers: host.providers,
        sourceFacts: host.sourceFacts,
        types: host.types,
        targetTypeForDefinition: projectDefinitionTargetType,
      },
      catalog.definitions,
      heritageById,
    );
  issues.push(...constructors.issues);

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
    if (arguments_.length !== definition.typeParameterNames.length) {
      return Object.freeze([]);
    }
    const heritage = heritageById.get(definition.id);
    if (heritage === undefined) {
      return Object.freeze([]);
    }
    const substitutions = new Map(
      definition.typeParameterNames.map((name, index) => [
        name,
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
    if (owner.typeParameterNames.length === 0) {
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
    if (arguments_.length !== owner.typeParameterNames.length) {
      return {
        kind: "unresolved",
        reason:
          `The selected receiver instantiates project declaration '${owner.sourceName}' with ${arguments_.length} target type arguments instead of ${owner.typeParameterNames.length}.`,
      };
    }
    return {
      kind: "resolved",
      type: substituteTargetTypeParameters(
        declaredType,
        new Map(owner.typeParameterNames.map((name, index) => [
          name,
          arguments_[index]!,
        ])),
      ),
    };
  };

  return Object.freeze({
    catalog,
    issues: Object.freeze(issues),
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
      const owner = projectMemberOwner(host.ast, catalog, declaration);
      if (owner === undefined) {
        return { kind: "not-project-member" };
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

function projectTypeDefinition(
  host: CsharpProjectTypeCatalogHost,
  declaration: Node,
): CsharpProjectTypeDefinition | undefined {
  const kind = declarationKind(host, declaration);
  const sourceFile = host.ast.getSourceFile(declaration);
  const name = host.ast.name(declaration);
  const identity = sourceNodeIdentity(host.ast, declaration);
  if (
    kind === undefined ||
    sourceFile === undefined ||
    name === undefined ||
    identity === undefined ||
    !host.navigation.isProjectDeclaration(declaration)
  ) {
    return undefined;
  }
  const rawTypeParameters = kind === "enum" || kind === "struct"
    ? []
    : host.ast.typeParameters(declaration);
  const typeParameters = rawTypeParameters.filter(
    (parameter): parameter is Node => parameter !== undefined,
  );
  const typeParameterNames = typeParameters.map((parameter) =>
    host.ast.name(parameter)
  );
  if (
    typeParameters.length !== rawTypeParameters.length ||
    typeParameterNames.some((parameter) => parameter === undefined)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: `tsonic.source:${identity}`,
    declaration,
    sourceFile,
    sourceName: host.ast.text(name),
    kind,
    typeParameterNames: Object.freeze(
      typeParameterNames.map((parameter) => host.ast.text(parameter)),
    ),
  });
}

function resolveDefinitionHeritage(
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
    const target = host.types.resolveSelectedType(
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
    const kindError = heritageKindError(definition, edge.kind, targetKind);
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

function heritageKindError(
  definition: CsharpProjectTypeDefinition,
  relation: "extends" | "implements",
  targetKind: CsharpProjectTypeDefinition["kind"] | undefined,
): string | undefined {
  if (definition.kind === "enum" || definition.kind === "struct") {
    return `Project ${definition.kind} '${definition.sourceName}' cannot declare C# heritage.`;
  }
  if (definition.kind === "interface") {
    if (relation === "implements") {
      return `Project interface '${definition.sourceName}' cannot implement a C# type.`;
    }
    return targetKind !== undefined && targetKind !== "interface"
      ? `Project interface '${definition.sourceName}' cannot inherit the selected non-interface C# type.`
      : undefined;
  }
  if (relation === "extends") {
    return targetKind !== undefined && targetKind !== "class"
      ? `Project class '${definition.sourceName}' cannot extend the selected non-class C# type.`
      : undefined;
  }
  return targetKind !== undefined && targetKind !== "interface"
    ? `Project class '${definition.sourceName}' cannot implement the selected non-interface C# type.`
    : undefined;
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
    host.providers.findTargetBindingByTargetId(type.id),
  );
  return binding?.kind === "class"
    ? "class"
    : binding?.kind === "interface"
      ? "interface"
      : binding?.kind === "enum"
        ? "enum"
        : undefined;
}

function projectDefinitionTargetType(
  definition: CsharpProjectTypeDefinition,
  typeArguments: readonly TargetTypeRef[],
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    definition.id,
    typeArguments,
    { kind: "named", name: definition.sourceName },
    { sourceDeclarationKind: definition.kind },
  );
}

function declarationKind(
  host: CsharpProjectTypeCatalogHost,
  declaration: Node,
): CsharpProjectTypeDefinition["kind"] | undefined {
  const ast = host.ast;
  return ast.is.IsClassDeclaration(declaration)
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

function visitSourceTree(
  ast: AstReader,
  root: Node,
  visit: (node: Node) => void,
): void {
  const pending = [root];
  const seen = new Set<Node>();
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined || seen.has(node)) {
      continue;
    }
    seen.add(node);
    visit(node);
    ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        pending.push(child);
      }
    });
  }
}
