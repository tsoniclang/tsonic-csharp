import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpBoundSourceType, csharpSourceBindings, csharpSourceTemplateState } from "./type-bindings.js";
import { nextState } from "./state.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { inferCsharpTargetTypeParameterBindings } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export function bindCsharpSourceTypeArguments(
  scope: CsharpTypeResolutionScope,
  type: Type,
  actual: TargetTypeRef | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  const bindings = queries.types.typeArgumentBindings(type);
  if (bindings === undefined || bindings.length === 0) return state;
  if (new Set(bindings.map(binding => binding.declaration)).size !== bindings.length) return undefined;
  const templateState = nextState(bindings.some(binding => state.sourceBindings?.has(binding.declaration) === true)
    ? csharpSourceTemplateState(bindings.map(binding => binding.declaration), state) : state);
  const parameters = bindings.map(binding => scope.resolveTypeWithState(binding.parameterType, queries.sourceFile, templateState));
  const template = queries.types.typeReferenceTarget(type);
  if (actual === undefined || template === undefined || parameters.some((parameter, index) =>
    parameter?.kind !== "type-parameter" || parameter.csharpDeclaration !== bindings[index]!.declaration)) return undefined;
  const identities = new Set(parameters.flatMap(parameter => parameter?.kind === "type-parameter" ? [parameter.identity] : []));
  if (identities.size !== bindings.length) return undefined;
  const pattern = scope.resolveTypeWithState(template, queries.sourceFile, templateState);
  const inferred = pattern === undefined ? undefined : inferCsharpTargetTypeParameterBindings(pattern, actual, identities);
  const targets = parameters.map(parameter => parameter?.kind === "type-parameter" ? inferred?.get(parameter.identity) : undefined);
  if (targets.some(target => target === undefined)) return undefined;
  if (bindings.some((binding, index) => {
    const previous = state.sourceBindings?.get(binding.declaration);
    return previous !== undefined && !targetTypeRefEquals(previous.targetType, targets[index]!);
  })) return undefined;
  return csharpSourceBindings(bindings.map(binding => binding.declaration),
    bindings.map(binding => binding.argumentType), targets as readonly TargetTypeRef[], state);
}

export function bindCsharpSourceDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly (TargetTypeRef | undefined)[],
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
