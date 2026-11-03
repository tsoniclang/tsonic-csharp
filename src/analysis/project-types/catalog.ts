import { analyzeCsharpProjectNames } from "../names/project-types.js";
import type { AstReader, Node } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpProjectTypeCatalogHost } from "./type-policy.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "../../policy/types/project/declaration-carriers.js";
import { projectTypeDefinition } from "./type-policy.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCurrentProjectDeclaration, CsharpCurrentProjectDeclarations } from "../source-evidence/model.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { CsharpProviderProjectDeclarations } from "../../policy/model/provider-calls.js";

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
): {
  readonly declarations: CsharpCurrentProjectDeclarations;
  readonly catalog: CsharpProjectTypeCatalog;
  publish(projections: CsharpGenericProjectionIndex): CsharpProviderProjectDeclarations;
} {
  const sourceDefinitions: CsharpProjectTypeDefinition[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const sourceByDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const sourceById = new Map<string, CsharpProjectTypeDefinition>();
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const byId = new Map<string, CsharpProjectTypeDefinition>();
  let publishedDefinitions: readonly CsharpProjectTypeDefinition[] | undefined;

  for (const sourceFile of host.navigation.sourceFiles) {
    visitSourceTree(host.ast, sourceFile, (declaration) => {
      const selected = projectTypeDefinition(host, declaration);
      if (selected.kind === "not-project-type") return;
      if (selected.kind === "rejected") {
        issues.push(Object.freeze({ node: selected.selection.member,
          code: selected.selection.failure === "resource" ? "CSHARP_ENUM_CONSTANT_RESOURCE_LIMIT" : "CSHARP_ENUM_CONSTANT_NOT_SUPPORTED",
          message: selected.selection.reason }));
        return;
      }
      const sourceDefinition = selected.definition;
      const existing = sourceById.get(sourceDefinition.id);
      if (existing !== undefined && existing.declaration !== declaration) {
        issues.push({
          node: declaration,
          code: "CSHARP_PROJECT_TYPE_IDENTITY_CONFLICT",
          message:
            `Project declarations '${existing.sourceName}' and '${sourceDefinition.sourceName}' produced the same canonical source identity '${sourceDefinition.id}'.`,
        });
        return;
      }
      sourceDefinitions.push(sourceDefinition);
      sourceByDeclaration.set(declaration, sourceDefinition);
      sourceById.set(sourceDefinition.id, sourceDefinition);
    });
  }

  analyzeCsharpProjectNames(host, sourceDefinitions, issues, definition => {
    sourceByDeclaration.set(definition.declaration, definition);
    sourceById.set(definition.id, definition);
  });
  const selectedDefinitions = Object.freeze(sourceDefinitions.map(definition => sourceByDeclaration.get(definition.declaration)!));
  const frozenIssues = Object.freeze(issues);
  const declarationByNode = new WeakMap<Node, CsharpCurrentProjectDeclaration>();
  const declarationById = new Map<string, CsharpCurrentProjectDeclaration>();
  const declarations = Object.freeze(selectedDefinitions.map(definition => {
    const { typeProjections: _typeProjections, outerTypeProjections: _outerTypeProjections,
      typeParameterBindings: _typeParameterBindings, ...sourceDeclaration } = definition;
    const declaration = Object.freeze(sourceDeclaration);
    declarationByNode.set(definition.declaration, declaration);
    declarationById.set(definition.id, declaration);
    return declaration;
  }));
  const containing = <Value>(node: Node | undefined, index: WeakMap<Node, Value>): Value | undefined => {
    for (let current = node; current !== undefined; current = host.ast.parent(current)) {
      const selected = index.get(current);
      if (selected !== undefined) return selected;
    }
    return undefined;
  };
  const currentDeclarations: CsharpCurrentProjectDeclarations = Object.freeze({
    declarations, issues: frozenIssues,
    declarationForId: (id: string) => declarationById.get(id),
    declarationForNode: (node: Node | undefined) => node === undefined ? undefined : declarationByNode.get(node),
    declarationContaining: (node: Node | undefined) => containing(node, declarationByNode),
    declarationForTarget: (type: TargetTypeRef | undefined) => type?.kind === "target-named" ? declarationById.get(type.id) : undefined,
  });
  const requirePublished = (): readonly CsharpProjectTypeDefinition[] => {
    if (publishedDefinitions === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "Native project binders require their completed current declaration projection publication.");
    return publishedDefinitions;
  };
  const nativeTypeForDeclaration = (
    declaration: Node | undefined,
    typeArguments: readonly TargetTypeRef[],
  ) => {
    requirePublished();
    const definition = declaration === undefined ? undefined : byDeclaration.get(declaration);
    return definition === undefined || typeArguments.length !== definition.typeParameterBindings.length
      ? undefined
      : projectDefinitionTargetType(definition, typeArguments.map((argument, index) =>
        argument.kind === "type-parameter" && argument.identity === definition.typeParameterBindings[index]?.identity
          ? [...definition.outerTypeProjections, ...definition.typeProjections].find(projection => projection.identity === argument.identity) ?? argument
          : argument));
  };
  const catalog: CsharpProjectTypeCatalog = Object.freeze({
    get definitions() { return requirePublished(); },
    issues: frozenIssues,
    definitionForId(id: string) {
      requirePublished();
      return byId.get(id);
    },
    definitionForDeclaration(declaration: Node | undefined) {
      requirePublished();
      return declaration === undefined ? undefined : byDeclaration.get(declaration);
    },
    definitionContainingDeclaration(declaration: Node | undefined) {
      requirePublished();
      return containing(declaration, byDeclaration);
    },
    definitionForTarget(type: TargetTypeRef | undefined) {
      requirePublished();
      return type?.kind === "target-named" ? byId.get(type.id) : undefined;
    },
    targetTypeForDeclaration: nativeTypeForDeclaration,
  });
  return Object.freeze({ declarations: currentDeclarations, catalog,
    publish(projections: CsharpGenericProjectionIndex): CsharpProviderProjectDeclarations {
      if (publishedDefinitions !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Native project declaration binders are published exactly once.");
      const completed = selectedDefinitions.map(definition => {
        const typeProjections = projections.genericProjection.get(definition.declaration);
        const outerTypeProjections = projections.outerGenericProjection.get(definition.declaration);
        const outerCount = definition.outerTypeParameters.length;
        const selected = Object.freeze({ ...definition, typeProjections, outerTypeProjections,
          typeParameterBindings: Object.freeze([
            ...definition.typeParameterBindings.slice(0, outerCount), ...outerTypeProjections,
            ...definition.typeParameterBindings.slice(outerCount), ...typeProjections,
          ]) });
        byDeclaration.set(selected.declaration, selected);
        byId.set(selected.id, selected);
        return selected;
      });
      publishedDefinitions = Object.freeze(completed);
      return Object.freeze({
        declarationForId: (id: string) => byId.get(id),
        declarationForTarget: (type: TargetTypeRef | undefined) => type?.kind === "target-named" ? byId.get(type.id) : undefined,
        declaredTypeForDeclaration: nativeTypeForDeclaration,
      });
    },
  });
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
