import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { csharpTypeProjection, type CsharpProjectedType } from "../../target-model/types/projections.js";
import { csharpSourceTypeParameterName, csharpSourceTypeParameters } from "../../target-model/names/type-parameters.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";

export interface CsharpGenericProjectionIndex {
  readonly entries: readonly { readonly declaration: Node; readonly parameters: readonly CsharpProjectedType[] }[];
  get(declaration: Node): readonly CsharpProjectedType[];
}

export function analyzeCsharpTypeProjections(
  source: TargetSourceProgram, evidence: CsharpSourceEvidenceIndex,
): CsharpGenericProjectionIndex {
  const byDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const { ast } = source;
  const visit = (node: Node): void => {
    if (ast.is.IsTypeAliasDeclaration(node) || ast.is.IsImportDeclaration(node) || evidence.isCompileTimeMetadata(node)) return;
    const parent = ast.parent(node);
    const isName = parent !== undefined && ast.name(parent) === node;
    const declarationOnly = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) || ast.is.IsInterfaceDeclaration(node);
    const pending = isName || declarationOnly ? [] : [evidence.nodeTargetType(node), evidence.storageTargetType(node)];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index += 1) {
      const type = pending[index];
      if (type === undefined || visited.has(targetTypeRefKey(type))) continue;
      visited.add(targetTypeRefKey(type));
      const projection = csharpTypeProjection(type);
      if (projection === undefined) {
        pending.push(...csharpTargetTypeComponents(type));
        continue;
      }
      const free = typeParameterNames(projection.csharpProjection.arguments);
      if (free.size === 0) continue;
      for (let owner: Node | undefined = node; owner !== undefined; owner = ast.parent(owner)) {
        const parameters = csharpSourceTypeParameters(owner, ast).flatMap(parameter => {
          const name = parameter === undefined ? undefined : csharpSourceTypeParameterName(parameter, ast);
          return name === undefined ? [] : [name];
        });
        if (!parameters.some(name => free.has(name)) || ![...free].every(name => parameters.includes(name))) continue;
        if (ast.is.IsTypeAliasDeclaration(owner)) break;
        let selected = byDeclaration.get(owner);
        if (selected === undefined) { selected = new Map(); byDeclaration.set(owner, selected); }
        selected.set(projection.name, projection);
        break;
      }
    }
    if (IsTypeSyntaxNode(ast, node)) return;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const entries = [...byDeclaration].map(([declaration, parameters]) => Object.freeze({ declaration,
    parameters: Object.freeze([...parameters.values()].sort((left, right) => left.name.localeCompare(right.name))) }));
  const index = new Map(entries.map(entry => [entry.declaration, entry.parameters]));
  return Object.freeze({ entries: Object.freeze(entries), get: (declaration: Node) => index.get(declaration) ?? [] });
}

function typeParameterNames(types: readonly TargetTypeRef[]): ReadonlySet<string> {
  const names = new Set<string>();
  const pending = [...types];
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index]!;
    if (type.kind === "type-parameter") names.add(type.name);
    else pending.push(...csharpTargetTypeComponents(type));
  }
  return names;
}

export function csharpTypeProjectionIndexesEqual(left: CsharpGenericProjectionIndex, right: CsharpGenericProjectionIndex): boolean {
  return left.entries.length === right.entries.length && left.entries.every(entry => {
    const parameters = right.get(entry.declaration);
    return parameters.length === entry.parameters.length && parameters.every((parameter, index) => parameter.name === entry.parameters[index]!.name);
  });
}
