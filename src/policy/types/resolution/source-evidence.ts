import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  Type,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../model/definitions.js";

export function sourceFactSubjectsForNode(
  node: Node,
  queries: SourceFileSemantics,
  parent?: Node,
): readonly ExtensionFactSubject[] {
  const symbols = definedValues([
    queries.getResolvedSymbolOrNil(node),
    queries.getSymbolAtLocation(node),
  ]);
  const subjects: ExtensionFactSubject[] = [];
  if (parent !== undefined) {
    subjects.push(parent);
  }
  subjects.push(node, ...symbols);
  for (const symbol of symbols) {
    subjects.push(
      ...definedValues(queries.getSymbolDeclarations(symbol)),
    );
  }
  return subjects;
}


export function resolveTypeParameter(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
): TargetTypeRef | undefined {
  const symbol = queries.getTypeSymbol(type);
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of definedValues(
    queries.getSymbolDeclarations(symbol),
  )) {
    if (!ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const nameNode = ast.name(declaration);
    if (nameNode !== undefined) {
      return {
        kind: "type-parameter",
        name: ast.text(nameNode),
      };
    }
  }
  return undefined;
}


export function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}


export function isUndefinedType(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.isNullish(type) &&
    queries.isNever(
      queries.removeMissingOrUndefined(type),
    );
}
