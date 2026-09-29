import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  Type,
} from "@tsonic/tsts";
import type {
  SourceDeclarationReference,
  SourceFileSemantics,
  SourceProgramNavigation,
} from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../target-model/names/type-parameters.js";

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
    subjects.push(...sourceDeclarationReferenceFactSubjects(reference));
  }
  return Object.freeze([...new Set(subjects)]);
}


export function sourceDeclarationReferenceFactSubjects(
  reference: SourceDeclarationReference,
): readonly ExtensionFactSubject[] {
  return Object.freeze([
    ...(reference.symbol === undefined ? [] : [reference.symbol]),
    reference.declaration,
  ]);
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
    const parameter = csharpSourceTypeParameter(declaration, ast);
    if (parameter !== undefined) return parameter;
  }
  return undefined;
}


export function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}
