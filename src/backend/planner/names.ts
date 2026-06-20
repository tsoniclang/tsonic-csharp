import {
  AsIdentifier,
  AsPrivateIdentifier,
  KindIdentifier,
  KindPrivateIdentifier,
  KindString,
} from "@tsonic/tsts";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";
import { sanitizeIdentifier } from "./identifiers.js";

export function planIdentifierName(
  node: Node | undefined,
  errorName: string,
  diagnostics: TargetDiagnostic[],
  description: string,
): string {
  if (node === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_NAME",
      category: "error",
      source: "tsonic-csharp",
      message: `${description} must be present for direct C# source emission; backend name synthesis is not allowed without finalized TSTS/provider facts.`,
    });
    return errorName;
  }
  if (node.Kind === KindIdentifier) {
    return sanitizeIdentifier(AsIdentifier(node)!.Text);
  }
  if (node.Kind === KindPrivateIdentifier) {
    return sanitizeIdentifier(AsPrivateIdentifier(node)!.Text);
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_NAME",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} must be an identifier for direct C# source emission. Node kind: ${KindString(node.Kind)}.`,
  });
  return errorName;
}
