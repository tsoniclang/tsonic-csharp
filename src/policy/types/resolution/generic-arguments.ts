import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpBoundSourceType, csharpSourceBindings } from "./type-bindings.js";
import { nextState } from "./state.js";

export function bindCsharpSourceDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
  sources: readonly (Type | undefined)[] | undefined,
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  const parameters = scope.host.ast.typeParameters(declaration);
  if (parameters.some(parameter => parameter === undefined) || new Set(parameters).size !== parameters.length ||
    typeArguments.length > parameters.length || sources !== undefined && sources.length !== typeArguments.length) return undefined;
  const queries = scope.host.semanticsFor(declaration);
  for (const [index, parameter] of (parameters as readonly Node[]).entries()) {
    const defaultType = scope.host.ast.as.AsTypeParameterDeclaration(parameter)?.DefaultType;
    const target = typeArguments[index] ?? (defaultType === undefined ? undefined
      : scope.resolveNodeWithState(defaultType, queries.sourceFile, nextState(state)));
    const defaultSource = defaultType === undefined ? undefined : queries.types.authoredType(defaultType);
    const suppliedSource = sources?.[index];
    const source = (suppliedSource === undefined ? undefined
      : csharpBoundSourceType(suppliedSource, queries, state)?.sourceType ?? suppliedSource) ?? (typeArguments[index] === undefined && defaultSource !== undefined
      ? csharpBoundSourceType(defaultSource, queries, state)?.sourceType ?? defaultSource : undefined);
    if (target === undefined || source === undefined) return undefined;
    const bound = csharpSourceBindings([parameter], [source], [target], state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  return state;
}

export function relateTypeArguments(
  sourceArguments: readonly TargetTypeRef[],
  relations: readonly {
    readonly sourceTypeParameterIndex: number;
    readonly targetTypeParameterIndex: number;
  }[],
  targetArity: number,
): readonly TargetTypeRef[] | undefined {
  if (relations.length !== sourceArguments.length) {
    return undefined;
  }
  const targetArguments: (TargetTypeRef | undefined)[] =
    Array.from({ length: targetArity });
  for (const relation of relations) {
    const source = sourceArguments[relation.sourceTypeParameterIndex];
    if (
      source === undefined ||
      relation.targetTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex >= targetArity ||
      targetArguments[relation.targetTypeParameterIndex] !== undefined
    ) {
      return undefined;
    }
    targetArguments[relation.targetTypeParameterIndex] = source;
  }
  return targetArguments.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? targetArguments
    : undefined;
}
