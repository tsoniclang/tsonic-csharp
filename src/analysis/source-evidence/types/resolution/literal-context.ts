import type { Node } from "@tsonic/tsts";
import { sourceExpressionCallArgument, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export function resolveCsharpDeclaredLiteralContext(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): { readonly kind: "selected"; readonly type: TargetTypeRef | undefined } | { readonly kind: "unavailable" } {
  const { host } = scope;
  const argument = sourceExpressionCallArgument(node, { ast: host.ast, semantics: { forNode: host.semanticsFor } });
  if (argument !== undefined) {
    const callQueries = host.semanticsFor(argument.call);
    const call = callQueries.operations.call(argument.call);
    const bindings = call?.sourceArgumentBindings.filter(binding =>
      binding.sourceForm === "value" && binding.sourceArgumentIndex === argument.argumentIndex);
    const binding = bindings?.length === 1 ? bindings[0] : undefined;
    return { kind: "selected", type: call === undefined || binding === undefined ? undefined
      : scope.resolveSourceCallArgumentParameter(call, binding, callQueries.sourceFile, new Set([argument.argumentIndex])) };
  }
  const context = queries.types.contextualValueSelection(node);
  return context.kind === "selected" ? { kind: "selected",
    type: scope.resolveSourceTypeComponentEvidence(context.component, queries, nextState(state)) }
    : { kind: "unavailable" };
}
