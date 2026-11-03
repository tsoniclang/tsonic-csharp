import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { nextState } from "./state.js";

export type CsharpSemanticTypeArgumentsSource = {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-reference" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "arguments"; readonly arguments: readonly {
      readonly type: Type | undefined;
      readonly state: CsharpTypeResolutionState;
    }[] }
);

export function formCsharpSemanticTypeArgumentsSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSemanticTypeArgumentsSource {
  if (!queries.types.isTypeReference(type)) {
    return Object.freeze({ kind: "not-reference", type, queries, state });
  }
  const sourceArguments = queries.types.effectiveTypeArguments(type);
  if (sourceArguments === undefined) {
    return Object.freeze({ kind: "unavailable", type, queries, state });
  }
  const argumentState = queries.types.isArrayLike(type) && !queries.types.isTuple(type)
    ? csharpSourceStorageComponentContext(host, state, { kind: "array-element" }) : state;
  return Object.freeze({ kind: "arguments", type, queries, state,
    arguments: Object.freeze(sourceArguments.map(argument => Object.freeze({ type: argument,
      state: Object.freeze(nextState(argumentState)) }))),
  });
}
