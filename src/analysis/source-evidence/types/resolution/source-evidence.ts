import type { AstReader, ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceDeclarationReference, SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export function resolveCsharpUnionMemberCarrier(
  scope: CsharpTypeResolutionScope,
  carrier: TargetTypeRef,
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const selected = scope.sourceUnions.select(carrier, selectedType, queries);
  return selected.kind === "unavailable"
    ? scope.resolveTypeWithState(selectedType, queries.sourceFile, nextState(state))
    : selected.kind === "resolved" ? selected.carrier : undefined;
}

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

export interface CsharpTypeParameterSource {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly parameter: ReturnType<typeof csharpSourceTypeParameter>;
}

export function formCsharpTypeParameterSource(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
): CsharpTypeParameterSource {
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) {
    return Object.freeze({ type, queries, parameter: undefined });
  }
  for (const declaration of definedValues(
    queries.declarations.symbolDeclarations(symbol),
  )) {
    if (!ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const parameter = csharpSourceTypeParameter(declaration, ast);
    if (parameter !== undefined) return Object.freeze({ type, queries, parameter });
  }
  return Object.freeze({ type, queries, parameter: undefined });
}

export function resolveFormedCsharpTypeParameterSource(
  source: CsharpTypeParameterSource,
  constraints: import("../../../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment,
): TargetTypeRef | undefined {
  const { parameter, type, queries } = source;
  return parameter === undefined ? undefined
    : constraints.resolve(parameter, { sourceFile: queries.sourceFile, sourceType: type });
}

export function resolveTypeParameter(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
  constraints: import("../../../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment,
): TargetTypeRef | undefined {
  return resolveFormedCsharpTypeParameterSource(formCsharpTypeParameterSource(type, queries, ast), constraints);
}

export function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}
