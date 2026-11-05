import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpBoundSourceType, csharpSourceBindings } from "./type-bindings.js";
import { nextState } from "./state.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { resolveCsharpSourceTypeDescriptor } from "./effective-types.js";
import { csharpSourceTypeParameters } from "../../../../source/extension/type-parameters.js";

export function bindCsharpSourceTypeArguments(
  scope: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  source: ResolvedSourceCallInfo | undefined,
): CsharpTypeResolutionState | undefined {
  const bindings = queries.types.typeArgumentBindings(type);
  const published = source === undefined ? undefined : scope.host.effectiveTypes.callInstantiation(source.call);
  if (published !== undefined && published.call !== source) return undefined;
  if (published !== undefined && source !== undefined) {
    const declarations: Node[] = [];
    const sources: Type[] = [];
    const targets: TargetTypeRef[] = [];
    for (const argument of [...published.receiver, ...published.method]) {
      const checked = queries.declarations.declaredType(argument.declaration);
      const target = resolveCsharpSourceTypeDescriptor(scope, argument.type, nextState(state), source.call);
      if (checked === undefined || target === undefined || declarations.includes(argument.declaration)) return undefined;
      declarations.push(argument.declaration); sources.push(checked); targets.push(target);
    }
    return csharpSourceBindings(declarations, sources, targets, state);
  }
  if (source !== undefined) return bindings === undefined || bindings.length === 0 ? state : undefined;
  if (bindings === undefined || bindings.length === 0) return state;
  if (new Set(bindings.map(binding => binding.declaration)).size !== bindings.length) return undefined;
  const targets = bindings.map(binding => {
    return scope.resolveTypeWithState(binding.argumentType, queries.sourceFile, nextState(state));
  });
  if (targets.some(target => target === undefined)) return undefined;
  return csharpSourceBindings(bindings.map(binding => binding.declaration),
    bindings.map(binding => binding.argumentType), targets as readonly TargetTypeRef[], state);
}

export function bindCsharpSourceDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  typeArguments: readonly TargetTypeRef[],
  sources: readonly (Type | undefined)[] | undefined,
  state: CsharpTypeResolutionState,
  queries: SourceFileSemantics,
): CsharpTypeResolutionState | undefined {
  const parameters = csharpSourceTypeParameters(declaration, scope.host.ast);
  if (parameters.some(parameter => parameter === undefined) || new Set(parameters).size !== parameters.length ||
    typeArguments.length > parameters.length || sources !== undefined && sources.length !== typeArguments.length) return undefined;
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
