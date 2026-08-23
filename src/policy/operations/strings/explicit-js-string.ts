import {
  sourceMarkerFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../context.js";
import {
  csharpJsStringTargetType,
  csharpStringTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";

export type CsharpJsStringConversionSelection =
  | { readonly kind: "not-js-string-conversion" }
  | {
      readonly kind: "resolved";
      readonly sourceValue: Node;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

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
  const sourceType = policy.types.resolveNode(sourceValue, sourceFile);
  const resultType = policy.types.resolveNode(node, sourceFile);
  if (
    sourceType === undefined ||
    !targetTypeRefEquals(sourceType, csharpStringTargetType())
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion source is not the native string carrier selected by C#.",
    };
  }
  if (
    resultType === undefined ||
    !targetTypeRefEquals(resultType, csharpJsStringTargetType())
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion result is not the explicit JavaScript string carrier selected by C#.",
    };
  }
  return Object.freeze({ kind: "resolved", sourceValue });
}
