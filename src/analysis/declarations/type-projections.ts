import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { csharpTypeProjection, getCsharpGenericOptionalParts, type CsharpProjectedType } from "../../target-model/types/projections.js";
import type { CsharpTargetOperationClassifications } from "../operations/model.js";
import { csharpSourceTypeParameterName, csharpSourceTypeParameters } from "../../target-model/names/type-parameters.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";

export interface CsharpGenericProjectionIndex {
  readonly entries: readonly {
    readonly declaration: Node;
    readonly parameters: readonly CsharpProjectedType[];
    readonly outerParameters: readonly CsharpProjectedType[];
  }[];
  get(declaration: Node): readonly CsharpProjectedType[];
  outer(declaration: Node): readonly CsharpProjectedType[];
}

export function analyzeCsharpTypeProjections(
  source: TargetSourceProgram, evidence: CsharpSourceEvidenceIndex, operations: CsharpTargetOperationClassifications,
): CsharpGenericProjectionIndex {
  const byDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const outerByDeclaration = new Map<Node, Map<string, CsharpProjectedType>>();
  const { ast } = source;
  const record = (index: Map<Node, Map<string, CsharpProjectedType>>, owner: Node, projection: CsharpProjectedType): void => {
    let parameters = index.get(owner);
    if (parameters === undefined) { parameters = new Map(); index.set(owner, parameters); }
    parameters.set(projection.name, projection);
  };
  const visit = (node: Node): void => {
    if (ast.is.IsTypeAliasDeclaration(node) || ast.is.IsImportDeclaration(node) || evidence.isCompileTimeMetadata(node)) return;
    const parent = ast.parent(node);
    const isName = parent !== undefined && ast.name(parent) === node;
    const declarationOnly = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) || ast.is.IsInterfaceDeclaration(node);
    const pending = isName || declarationOnly ? [] : [evidence.nodeTargetType(node), evidence.storageTargetType(node),
      ...operations.call(node)?.sourceTypeArguments ?? []];
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
      pending.push(...projection.csharpProjection.arguments);
      const optional = getCsharpGenericOptionalParts(projection);
      if (optional !== undefined) pending.push(optional.operations);
      const free = typeParameterNames(projection.csharpProjection.arguments);
      if (free.size === 0) continue;
      for (let owner: Node | undefined = node; owner !== undefined; owner = ast.parent(owner)) {
        const parameters = csharpSourceTypeParameters(owner, ast).flatMap(parameter => {
          const name = parameter === undefined ? undefined : csharpSourceTypeParameterName(parameter, ast);
          return name === undefined ? [] : [name];
        });
        if (ast.is.IsTypeAliasDeclaration(owner)) break;
        if (parameters.some(name => free.has(name))) {
          record(byDeclaration, owner, projection);
          break;
        }
        if (ast.is.IsClassDeclaration(owner) || ast.is.IsClassExpression(owner)) {
          const queries = source.semantics.forNode(owner);
          const declared = queries.declarations.declaredType(owner);
          const outer = declared === undefined ? [] : queries.types.typeArgumentBindings(declared)
            ?.filter(binding => binding.scope === "outer")
            .map(binding => csharpSourceTypeParameterName(binding.declaration, ast)) ?? [];
          if ([...free].every(name => outer.includes(name))) record(outerByDeclaration, owner, projection);
        }
      }
    }
    if (IsTypeSyntaxNode(ast, node)) return;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const sorted = (parameters: Map<string, CsharpProjectedType> | undefined): readonly CsharpProjectedType[] =>
    Object.freeze([...(parameters?.values() ?? [])].sort((left, right) => left.name.localeCompare(right.name)));
  const entries = [...new Set([...byDeclaration.keys(), ...outerByDeclaration.keys()])].map(declaration => Object.freeze({
    declaration, parameters: sorted(byDeclaration.get(declaration)), outerParameters: sorted(outerByDeclaration.get(declaration)),
  }));
  const index = new Map(entries.map(entry => [entry.declaration, entry]));
  return Object.freeze({ entries: Object.freeze(entries),
    get: (declaration: Node) => index.get(declaration)?.parameters ?? [],
    outer: (declaration: Node) => index.get(declaration)?.outerParameters ?? [],
  });
}

function typeParameterNames(types: readonly TargetTypeRef[]): ReadonlySet<string> {
  const names = new Set<string>();
  const pending = [...types];
  for (let index = 0; index < pending.length; index += 1) {
    const type = pending[index]!;
    const projection = csharpTypeProjection(type);
    if (projection !== undefined) pending.push(...projection.csharpProjection.arguments);
    else if (type.kind === "type-parameter") names.add(type.name);
    else pending.push(...csharpTargetTypeComponents(type));
  }
  return names;
}

export function csharpTypeProjectionIndexesEqual(left: CsharpGenericProjectionIndex, right: CsharpGenericProjectionIndex): boolean {
  return left.entries.length === right.entries.length && left.entries.every(entry => {
    const parameters = right.get(entry.declaration);
    const outer = right.outer(entry.declaration);
    return parameters.length === entry.parameters.length && parameters.every((parameter, index) => parameter.name === entry.parameters[index]!.name) &&
      outer.length === entry.outerParameters.length && outer.every((parameter, index) => parameter.name === entry.outerParameters[index]!.name);
  });
}
