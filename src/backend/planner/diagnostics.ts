import { KindString } from "./source-ast.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";

export function unsupportedNodeDiagnostic(node: Node, message: string): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message: `${message} Node kind: ${KindString(node.Kind)}.`,
  };
}
