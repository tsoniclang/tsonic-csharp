import {
  AsIdentifier,
  AsPrivateIdentifier,
  HasSourceKind,
  KindIdentifier,
  KindPrivateIdentifier,
  KindString,
  Node_Text,
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { sanitizeIdentifier } from "./identifiers.js";

export function planIdentifierName(
  node: Node | undefined,
  errorName: string,
  input: TargetCompileInput,
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
  if (HasSourceKind(input.ast, node, KindIdentifier)) {
    return sanitizeIdentifier(Node_Text(AsIdentifier(node)));
  }
  if (HasSourceKind(input.ast, node, KindPrivateIdentifier)) {
    return sanitizeIdentifier(Node_Text(AsPrivateIdentifier(node)));
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_NAME",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} must be an identifier for direct C# source emission. Node kind: ${KindString(node.Kind)}.`,
  });
  return errorName;
}
