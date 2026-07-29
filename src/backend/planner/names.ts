import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsIdentifier,
  HasSourceKind,
  KindIdentifier,
  KindPrivateIdentifier,
  KindString,
  Node_Text,
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import { requireCsharpIdentifier } from "./identifiers.js";

export function planIdentifierName(
  node: Node | undefined,
  errorName: string,
  input: CsharpTranslationContext,
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
    return requireCsharpIdentifier(Node_Text(input.ast, AsIdentifier(node)), diagnostics, description);
  }
  if (HasSourceKind(input.ast, node, KindPrivateIdentifier)) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_NAME",
      category: "error",
      source: "tsonic-csharp",
      message: `${description} is a private JavaScript identifier and requires a finalized C# target-name fact before emission.`,
    });
    return errorName;
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_NAME",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} must be an identifier for direct C# source emission. Node kind: ${KindString(node.Kind)}.`,
  });
  return errorName;
}
