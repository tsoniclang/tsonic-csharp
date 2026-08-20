import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  Type,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function sourceFactSubjectsForNode(
  node: Node,
  navigation: SourceProgramNavigation,
  parent?: Node,
): readonly ExtensionFactSubject[] {
  const reference = navigation.sourceReferenceFor(node);
  const subjects: ExtensionFactSubject[] = [];
  if (parent !== undefined) {
    subjects.push(parent);
  }
  subjects.push(node);
  if (reference !== undefined) {
    subjects.push(reference.symbol, reference.declaration);
  }
  return Object.freeze([...new Set(subjects)]);
}


export function resolveTypeParameter(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
): TargetTypeRef | undefined {
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of definedValues(
    queries.declarations.symbolDeclarations(symbol),
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
  const nonNullishType = queries.types.withoutMissingOrUndefined(type);
  return queries.types.isNullish(type) &&
    nonNullishType !== undefined &&
    queries.types.isNever(nonNullishType);
}
