import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { formCsharpTargetCallSource } from "../../../operations/members/selected-members.js";
import type { CsharpProviderCallSourceEvidence } from "../../../operations/members/calls/selection.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";

export type CsharpSelectedExpressionSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "transparent"; readonly expression: Node | undefined }
  | { readonly kind: "call"; readonly isNew: boolean; readonly selection: CsharpProviderCallSourceEvidence }
  | { readonly kind: "other" }
);

export function formCsharpSelectedExpressionSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSelectedExpressionSource {
  if (host.ast.is.IsParenthesizedExpression(node) || host.ast.is.IsSatisfiesExpression(node)) {
    const expression = host.ast.is.IsParenthesizedExpression(node)
      ? host.ast.as.AsParenthesizedExpression(node)?.Expression : host.ast.as.AsSatisfiesExpression(node)?.Expression;
    return Object.freeze({ kind: "transparent", node, queries, state, expression });
  }
  if (host.ast.is.IsCallExpression(node) || host.ast.is.IsNewExpression(node)) {
    return Object.freeze({ kind: "call", node, queries, state, isNew: host.ast.is.IsNewExpression(node),
      selection: formCsharpTargetCallSource(host, {
        call: node, sourceFile: queries.sourceFile, source: queries.operations.call(node),
      }),
    });
  }
  return Object.freeze({ kind: "other", node, queries, state });
}
