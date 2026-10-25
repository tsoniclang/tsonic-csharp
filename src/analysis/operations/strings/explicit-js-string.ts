import type { CsharpJsStringConversionSelection } from "../../../target-model/records/explicit-js-string.js";
import { sourceMarkerFactKey } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { selectCsharpNativeJsStringConversion } from "../../../policy/operations/js-values/explicit-js-string.js";
export function selectCsharpJsStringConversion(
  policy: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpJsStringConversionSelection {
  const marker = policy.sourceFacts?.getFact(node, sourceMarkerFactKey);
  if (marker?.kind !== "call-marker" || marker.marker !== "js-string") {
    return { kind: "not-js-string-conversion" };
  }
  if (!policy.ast.is.IsCallExpression(node)) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion fact is attached to a non-call source node.",
    };
  }
  const arguments_ = policy.ast.arguments(node);
  const sourceValue = arguments_[0];
  if (
    arguments_.length !== 1 ||
    sourceValue === undefined ||
    policy.ast.is.IsSpreadElement(sourceValue)
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion requires one non-spread native string value.",
    };
  }
  const sourceType = policy.types.resolveNode(sourceValue, sourceFile)?.type;
  const resultType = policy.types.resolveNode(node, sourceFile)?.type;
  return selectCsharpNativeJsStringConversion(sourceValue, sourceType, resultType);
}
