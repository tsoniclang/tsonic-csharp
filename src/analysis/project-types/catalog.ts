import { analyzeCsharpProjectNames } from "../names/project-types.js";
import type { AstReader, Node } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpProjectTypeCatalogHost } from "./type-policy.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "../../policy/types/project/declaration-carriers.js";
import { projectTypeDefinition } from "./type-policy.js";
import type { SourceRefusal } from "@tsonic/target-api/source";
import type { CsharpRepresentationView } from "../../target-model/types/representation.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpRepresentationDiagnostic } from "../source-evidence/representations.js";

export interface CsharpProjectTypeCatalogBuilder extends CsharpProjectTypeCatalog {
  complete(representation: CsharpRepresentationView): void;
}

export function createCsharpProjectTypeCatalog(
  host: CsharpProjectTypeCatalogHost,
  projections?: import("../../target-model/records/types/type-projections.js").CsharpGenericProjectionIndex,
): CsharpProjectTypeCatalogBuilder {
  const definitions: CsharpProjectTypeDefinition[] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  const byDeclaration = new WeakMap<Node, CsharpProjectTypeDefinition>();
  const byId = new Map<string, CsharpProjectTypeDefinition>();
  const refused = new WeakMap<Node, SourceRefusal>();
  let completed = false;

  for (const sourceFile of host.facts.navigation.sourceFiles) {
    visitSourceTree(host.ast, sourceFile, (declaration) => {
      const selected = projectTypeDefinition(host, declaration);
      if (selected.kind === "not-project-type") return;
      if (selected.kind === "rejected") {
        refused.set(declaration, selected.refusal);
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
  return Object.freeze({
    get definitions() { return Object.freeze(definitions.map(definition => byDeclaration.get(definition.declaration)!)); },
    get issues() { return Object.freeze([...issues]); },
    select(declaration) {
      const refusal = refused.get(declaration);
      if (refusal !== undefined) return Object.freeze({ kind: "source-refused", refusal });
      const value = byDeclaration.get(declaration);
      return Object.freeze({ kind: "represented", value: value === undefined ? Object.freeze({ kind: "none" })
        : Object.freeze({ kind: "present", value }) });
    },
    complete(representation) {
      if (completed) failTargetAnalysisInvariant("tsonic-csharp", "A Native project catalog completes its original binder constraints exactly once.");
      completed = true;
      for (const original of definitions) {
        const definition = byDeclaration.get(original.declaration)!;
        const parameters: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] = [];
        let failed = false;
        for (const parameter of definition.typeParameterBindings) {
          if (parameter.csharpProjection !== undefined) { parameters.push(parameter); continue; }
          const declaration = parameter.csharpDeclaration;
          if (declaration === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An original Native binder requires its declaration.", definition.declaration);
          const selected = representation.parameter(host.facts.descriptors.typeParameter(declaration), declaration);
          if (selected.kind !== "represented") {
            const diagnostic = csharpRepresentationDiagnostic(selected);
            issues.push({ node: diagnostic.sourceNode ?? declaration, source: diagnostic.source, code: diagnostic.code, message: diagnostic.message });
            failed = true;
            break;
          }
          parameters.push(selected.value);
        }
        if (!failed) replaceDefinition(Object.freeze({ ...definition, typeParameterBindings: Object.freeze(parameters) }));
      }
    },
    definitionForId(id: string) {
      return byId.get(id);
    },
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
