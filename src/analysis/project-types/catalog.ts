import { analyzeCsharpProjectNames } from "../names/project-types.js";
import type { AstReader, Node } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/project-types.js";
import type { CsharpProjectTypeCatalogHost } from "./type-policy.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import { projectDefinitionTargetType } from "../../policy/types/project/declaration-carriers.js";
import { projectTypeDefinition } from "./type-policy.js";

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
  projections?: import("../../target-model/records/type-projections.js").CsharpGenericProjectionIndex,
): CsharpProjectTypeCatalog {
  const definitions: CsharpProjectTypeDefinition[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const byId = new Map<string, CsharpProjectTypeDefinition>();

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
      const selectedProjections = projections?.genericProjection.get(declaration) ?? [];
      const outerProjections = projections?.outerGenericProjection.get(declaration) ?? [];
      const outerCount = sourceDefinition.outerTypeParameters.length;
      const definition = Object.freeze({ ...sourceDefinition, typeProjections: selectedProjections, outerTypeProjections: outerProjections,
        typeParameterBindings: Object.freeze([
        ...sourceDefinition.typeParameterBindings.slice(0, outerCount), ...outerProjections,
        ...sourceDefinition.typeParameterBindings.slice(outerCount), ...selectedProjections,
      ]) });
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

  analyzeCsharpProjectNames(host, definitions, issues, replaceDefinition);
  const frozenDefinitions = Object.freeze(definitions.map(definition => byDeclaration.get(definition.declaration)!));
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
          typeArguments.length !== definition.typeParameterBindings.length
        ? undefined
        : projectDefinitionTargetType(definition, typeArguments.map((argument, index) =>
          argument.kind === "type-parameter" && argument.identity === definition.typeParameterBindings[index]?.identity
            ? [...definition.outerTypeProjections, ...definition.typeProjections].find(projection => projection.identity === argument.identity) ?? argument
            : argument));
    },
  });

  function replaceDefinition(selected: CsharpProjectTypeDefinition): void {
    byDeclaration.set(selected.declaration, selected);
    byId.set(selected.id, selected);
  }
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
