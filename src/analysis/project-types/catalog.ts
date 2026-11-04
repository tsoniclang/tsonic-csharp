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
import type { CsharpGenericProjectionIndex, CsharpPublishedCallableProjections,
  CsharpCallableProjectionReceipt } from "../../target-model/records/types/type-projections.js";
import type { CsharpTypeProjectionSource } from "../declarations/type-projection-source.js";
import { csharpTypeProjectionVectorsEqual, type CsharpProjectedType } from "../../target-model/types/projections.js";
import type { CsharpProviderProjectDeclarations } from "../../policy/model/provider-calls.js";
import { completeCsharpProjectTypeABI, requireCsharpProjectTypeABI } from "./catalog/abi.js";

interface CsharpProjectTypeCatalogEntry {
  readonly declared: CsharpProjectTypeDeclaration;
  abi: CsharpProjectTypeDefinition | undefined;
}

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
  bodySources: CsharpTypeProjectionSource,
): {
  readonly declarations: CsharpCurrentProjectDeclarations;
  readonly catalog: CsharpProjectTypeCatalog;
  publishCallableProjections(receipt: CsharpPublishedCallableProjections): void;
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
  const callableProjections = new Map<Node, CsharpPublishedCallableProjections>();
  const noBodyProjections: readonly CsharpProjectedType[] = Object.freeze([]);
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
    if (bodySources.ownerFor(definition.declaration) === undefined) {
      const source = bodySources.sourceFor(definition.declaration);
      if (source === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared project ABI requires its actual captured declaration source.", definition.declaration);
      entry.abi = completeCsharpProjectTypeABI(definition, Object.freeze({ kind: "declared", source }));
    }
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
    const entry = declaration === undefined ? undefined : byDeclaration.get(declaration);
    if (entry === undefined) return undefined;
    const definition = entry.abi;
    if (definition === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Physical project binders require their exact current callable ABI publication.", entry.declared.declaration);
    return typeArguments.length !== definition.typeParameterBindings.length
      ? undefined
      : projectDefinitionTargetType(definition, typeArguments.map((argument, index) =>
        argument.kind === "type-parameter" && argument.identity === definition.typeParameterBindings[index]?.identity
          ? [...definition.outerTypeProjections, ...definition.typeProjections].find(projection => projection.identity === argument.identity) ?? argument
          : argument));
  };
  const abiDefinition = (entry: CsharpProjectTypeCatalogEntry | undefined): CsharpProjectTypeDefinition | undefined => {
    if (entry === undefined) return undefined;
    if (entry.abi === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Physical project binders require their exact current callable ABI publication.", entry.declared.declaration);
    return entry.abi;
  };
  const callableProjectionReceipt = (declaration: Node): CsharpCallableProjectionReceipt => {
    const source = bodySources.ownerFor(declaration);
    if (source === undefined) {
      return Object.freeze({ kind: "declaration", declaration, source: bodySources.sourceFor(declaration) });
    }
    const receipt = callableProjections.get(declaration);
    if (receipt?.source !== source) return failTargetAnalysisInvariant("tsonic-csharp",
      "A physical callable requires its exact current body-harvest publication.", declaration);
    return receipt;
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
      const receipt = callableProjectionReceipt(declaration);
      return receipt.kind === "declaration" ? noBodyProjections : receipt.projections;
    },
    callableProjections: callableProjectionReceipt,
    definitionForId(id: string) {
      return abiDefinition(byId.get(id));
    },
    definitionForDeclaration(declaration: Node | undefined) {
      return abiDefinition(declaration === undefined ? undefined : byDeclaration.get(declaration));
    },
    definitionContainingDeclaration(declaration: Node | undefined) {
      return abiDefinition(containing(declaration, byDeclaration));
    },
    definitionForTarget(type: TargetTypeRef | undefined) {
      return abiDefinition(type?.kind === "target-named" ? byId.get(type.id) : undefined);
    },
    targetTypeForDeclaration: nativeTypeForDeclaration,
  });
  return Object.freeze({ declarations: currentDeclarations, catalog,
    publishCallableProjections(receipt: CsharpPublishedCallableProjections): void {
      const { source, declaration } = receipt;
      if (receipt.kind !== "source" || source.declaration !== declaration || bodySources.ownerFor(declaration) !== source ||
        callableProjections.has(declaration) || abiDefinitions !== undefined ||
        receipt.projections !== receipt.index.genericProjection.get(declaration)) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Each current callable body publishes its actual A once before physical project completion.", declaration);
      }
      callableProjections.set(declaration, receipt);
      const entry = byDeclaration.get(declaration);
      if (entry !== undefined) {
        if (entry.abi !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
          "A project ABI is constructed exactly once from its declared or published projection inputs.", declaration);
        entry.abi = completeCsharpProjectTypeABI(entry.declared, Object.freeze({ kind: "published", index: receipt.index }));
      }
    },
    publishABI(projections: CsharpGenericProjectionIndex): CsharpProviderProjectDeclarations {
      if (abiDefinitions !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Current project callable ABIs are published exactly once.");
      for (const source of bodySources.owners) {
        const receipt = callableProjections.get(source.declaration);
        if (receipt?.source !== source ||
          !csharpTypeProjectionVectorsEqual(receipt.projections, projections.genericProjection.get(source.declaration)) ||
          !csharpTypeProjectionVectorsEqual(receipt.index.outerGenericProjection.get(source.declaration),
            projections.outerGenericProjection.get(source.declaration))) return failTargetAnalysisInvariant("tsonic-csharp",
          "A final project ABI must retain every exact published callable body vector, never a second answer.", source.declaration);
      }
      const selected = Object.freeze(selectedDefinitions.map(declared => {
        const definition = byDeclaration.get(declared.declaration)!.abi;
        if (definition === undefined ||
          !csharpTypeProjectionVectorsEqual(definition.typeProjections, projections.genericProjection.get(declared.declaration)) ||
          !csharpTypeProjectionVectorsEqual(definition.outerTypeProjections, projections.outerGenericProjection.get(declared.declaration))) {
          return failTargetAnalysisInvariant("tsonic-csharp", "Final project publication must retain its single exact physical binder answer.", declared.declaration);
        }
        requireCsharpProjectTypeABI(declared, definition);
        return definition;
      }));
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
