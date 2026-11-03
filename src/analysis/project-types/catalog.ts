import { analyzeCsharpProjectNames } from "../names/project-types.js";
import type { AstReader, Node } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpProjectTypeCatalogHost } from "./type-policy.js";
import type { CsharpProjectTypeDeclaration, CsharpProjectTypeDefinition, CsharpProjectTypeIssue, CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "../../policy/types/project/declaration-carriers.js";
import { projectTypeDefinition } from "./type-policy.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCurrentProjectDeclaration, CsharpCurrentProjectDeclarations } from "../source-evidence/model.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { CsharpProviderProjectDeclarations } from "../../policy/model/provider-calls.js";
import { completeCsharpProjectTypeABI, requireCsharpProjectTypeABI } from "./catalog/abi.js";

interface CsharpProjectTypeCatalogEntry {
  readonly declared: CsharpProjectTypeDeclaration;
  abi: CsharpProjectTypeDefinition | undefined;
}

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
): {
  readonly declarations: CsharpCurrentProjectDeclarations;
  readonly catalog: CsharpProjectTypeCatalog;
  publishABI(projections: CsharpGenericProjectionIndex): CsharpProviderProjectDeclarations;
  complete(policy: CsharpProjectTypePolicy): void;
} {
  const sourceDefinitions: CsharpProjectTypeDeclaration[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const sourceByDeclaration = new WeakMap<Node, CsharpProjectTypeDeclaration>();
  const sourceById = new Map<string, CsharpProjectTypeDeclaration>();
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeCatalogEntry>();
  const byId = new Map<string, CsharpProjectTypeCatalogEntry>();
  let abiDefinitions: readonly CsharpProjectTypeDefinition[] | undefined;
  let publishedProjections: CsharpGenericProjectionIndex | undefined;
  let completedDefinitions: readonly CsharpProjectTypeDefinition[] | undefined;

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
    const entry: CsharpProjectTypeCatalogEntry = { declared: definition, abi: undefined };
    byDeclaration.set(definition.declaration, entry);
    byId.set(definition.id, entry);
    const { authoredTypeParameterBindings: _authoredTypeParameterBindings, ...sourceDeclaration } = definition;
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
  const requirePublished = (phase: "abi" | "completed"): readonly CsharpProjectTypeDefinition[] => {
    const selected = phase === "abi" ? abiDefinitions : completedDefinitions;
    if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", phase === "abi"
      ? "Physical project binders require their current callable ABI publication."
      : "Completed project definitions require their native representation publication.");
    return selected;
  };
  const nativeTypeForDeclaration = (
    declaration: Node | undefined,
    typeArguments: readonly TargetTypeRef[],
  ) => {
    requirePublished("abi");
    const definition = declaration === undefined ? undefined : byDeclaration.get(declaration)?.abi;
    return definition === undefined || typeArguments.length !== definition.typeParameterBindings.length
      ? undefined
      : projectDefinitionTargetType(definition, typeArguments.map((argument, index) =>
        argument.kind === "type-parameter" && argument.identity === definition.typeParameterBindings[index]?.identity
          ? [...definition.outerTypeProjections, ...definition.typeProjections].find(projection => projection.identity === argument.identity) ?? argument
          : argument));
  };
  const catalog: CsharpProjectTypeCatalog = Object.freeze({
    declaredDefinitions: selectedDefinitions,
    get abiDefinitions() { return requirePublished("abi"); },
    get definitions() { return requirePublished("completed"); },
    issues: frozenIssues,
    declarationForId: (id: string) => byId.get(id)?.declared,
    declarationForNode: (declaration: Node | undefined) => declaration === undefined ? undefined : byDeclaration.get(declaration)?.declared,
    declarationContaining: (declaration: Node | undefined) => containing(declaration, byDeclaration)?.declared,
    declarationForTarget: (type: TargetTypeRef | undefined) => type?.kind === "target-named" ? byId.get(type.id)?.declared : undefined,
    genericProjections(declaration: Node) {
      requirePublished("abi");
      return publishedProjections!.genericProjection.get(declaration);
    },
    definitionForId(id: string) {
      requirePublished("abi");
      return byId.get(id)?.abi;
    },
    definitionForDeclaration(declaration: Node | undefined) {
      requirePublished("abi");
      return declaration === undefined ? undefined : byDeclaration.get(declaration)?.abi;
    },
    definitionContainingDeclaration(declaration: Node | undefined) {
      requirePublished("abi");
      return containing(declaration, byDeclaration)?.abi;
    },
    definitionForTarget(type: TargetTypeRef | undefined) {
      requirePublished("abi");
      return type?.kind === "target-named" ? byId.get(type.id)?.abi : undefined;
    },
    targetTypeForDeclaration: nativeTypeForDeclaration,
  });
  return Object.freeze({ declarations: currentDeclarations, catalog,
    publishABI(projections: CsharpGenericProjectionIndex): CsharpProviderProjectDeclarations {
      if (abiDefinitions !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Current project callable ABIs are published exactly once.");
      const selected = Object.freeze(selectedDefinitions.map(declared => completeCsharpProjectTypeABI(declared, projections)));
      for (const definition of selected) byDeclaration.get(definition.declaration)!.abi = definition;
      publishedProjections = projections;
      abiDefinitions = selected;
      return Object.freeze({
        declarationForId: (id: string) => byId.get(id)?.abi,
        declarationForTarget: (type: TargetTypeRef | undefined) => type?.kind === "target-named" ? byId.get(type.id)?.abi : undefined,
        declaredTypeForDeclaration: nativeTypeForDeclaration,
      });
    },
    complete(policy: CsharpProjectTypePolicy): void {
      if (completedDefinitions !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native project representation definitions are completed exactly once.");
      if (policy.catalog !== catalog) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native project completion requires its same owning catalog and completed policy.");
      if (policy.abi.catalog !== catalog || policy.directSupertypes !== policy.abi.directSupertypes ||
        policy.heritageForDeclaration !== policy.abi.heritageForDeclaration ||
        policy.instantiateDeclarationType !== policy.abi.instantiateDeclarationType ||
        policy.instantiateMemberType !== policy.abi.instantiateMemberType) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native project completion must retain its exact declared ABI relation readers.");
      const selected = requirePublished("abi");
      for (const definition of selected) requireCsharpProjectTypeABI(byDeclaration.get(definition.declaration)!.declared, definition);
      completedDefinitions = selected;
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
