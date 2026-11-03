import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionState } from "./model.js";

export interface CsharpSourceTypeBindingEvidence {
  readonly type: Type;
  readonly declarations: readonly Node[];
}

export function formCsharpSourceTypeBindingEvidence(
  type: Type,
  queries: SourceFileSemantics,
): CsharpSourceTypeBindingEvidence | undefined {
  const symbol = queries.declarations.typeSymbol(type);
  return symbol === undefined ? undefined : Object.freeze({ type,
    declarations: Object.freeze([...queries.declarations.symbolDeclarations(symbol)]),
  });
}

export function completeCsharpBoundSourceType(
  source: CsharpSourceTypeBindingEvidence | undefined,
  state: CsharpTypeResolutionState,
): { readonly sourceType: Type; readonly targetType: import("../../../../target-model/types/model.js").TargetTypeRef } | undefined {
  if (state.sourceBindings === undefined || source === undefined) return undefined;
  const matches = source.declarations.flatMap(declaration => {
    const binding = state.sourceBindings!.get(declaration);
    return binding === undefined ? [] : [binding];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function csharpSourceTemplateState(
  parameters: readonly (Node | undefined)[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  const declarations = new Set(parameters);
  return { ...state, sourceBindings: new Map(
    [...state.sourceBindings ?? []].filter(([node]) => !declarations.has(node)),
  ) };
}

export function csharpBoundSourceType(
  type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): { readonly sourceType: Type; readonly targetType: import("../../../../target-model/types/model.js").TargetTypeRef } | undefined {
  if (state.sourceBindings === undefined) return undefined;
  return completeCsharpBoundSourceType(formCsharpSourceTypeBindingEvidence(type, queries), state);
}

export function csharpSourceBindings(
  parameters: readonly Node[], sources: readonly Type[],
  targets: readonly import("../../../../target-model/types/model.js").TargetTypeRef[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  if (parameters.length !== sources.length || parameters.length !== targets.length) return undefined;
  const bindings = new Map(state.sourceBindings);
  for (const [index, parameter] of parameters.entries()) {
    bindings.set(parameter, { sourceType: sources[index]!, targetType: targets[index]! });
  }
  return { ...state, sourceBindings: bindings };
}
