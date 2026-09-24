import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionState } from "./model.js";

export function csharpBoundSourceType(
  type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): { readonly sourceType: Type; readonly targetType: import("../../../target-model/types/model.js").TargetTypeRef } | undefined {
  if (state.sourceBindings === undefined) return undefined;
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) return undefined;
  const declarations = queries.declarations.symbolDeclarations(symbol);
  const matches = declarations.flatMap(declaration => {
    const binding = state.sourceBindings!.get(declaration);
    return binding === undefined ? [] : [binding];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function csharpSourceBindings(
  parameters: readonly Node[], sources: readonly Type[],
  targets: readonly import("../../../target-model/types/model.js").TargetTypeRef[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  if (parameters.length !== sources.length || parameters.length !== targets.length) return undefined;
  const bindings = new Map(state.sourceBindings);
  for (const [index, parameter] of parameters.entries()) {
    bindings.set(parameter, { sourceType: sources[index]!, targetType: targets[index]! });
  }
  return { ...state, sourceBindings: bindings };
}
