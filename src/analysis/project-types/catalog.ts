import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpProjectTypeCatalog,
  CsharpProjectTypeCatalogHost,
  CsharpProjectTypeDefinition,
  CsharpProjectTypeIssue,
} from "../../policy/types/project/project-types.js";
import {
  projectDefinitionTargetType,
  projectTypeDefinition,
} from "../../policy/types/project/project-types.js";

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
  projections?: import("../declarations/type-projections.js").CsharpGenericProjectionIndex,
): CsharpProjectTypeCatalog {
  const definitions: CsharpProjectTypeDefinition[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const byId = new Map<string, CsharpProjectTypeDefinition>();

  for (const sourceFile of host.navigation.sourceFiles) {
    visitSourceTree(host.ast, sourceFile, (declaration) => {
      const sourceDefinition = projectTypeDefinition(host, declaration);
      if (sourceDefinition === undefined) {
        return;
      }
      const definition = Object.freeze({ ...sourceDefinition, typeParameterNames: Object.freeze([
        ...sourceDefinition.typeParameterNames, ...projections?.get(declaration).map(parameter => parameter.name) ?? [],
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

  const occupiedNames = new Set(definitions.filter(definition => !definition.local).map(definition => definition.sourceName));
  const allocate = (preferred: string): string => {
    let name = preferred;
    for (let suffix = 2; occupiedNames.has(name); suffix += 1) name = `${preferred}_${suffix}`;
    occupiedNames.add(name);
    return name;
  };
  for (const definition of definitions.filter(definition => definition.local).sort((left, right) => left.id.localeCompare(right.id))) {
    const sourceName = allocate(definition.sourceName);
    const selected = Object.freeze({ ...definition, sourceName, factoryName: allocate(`${sourceName}Factory`) });
    definitions[definitions.indexOf(definition)] = selected;
    byDeclaration.set(definition.declaration, selected);
    byId.set(definition.id, selected);
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
