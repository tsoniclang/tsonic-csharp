import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";

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
  const resolution = input.names.resolve(node);
  if (resolution.kind === "resolved") {
    return resolution.name;
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_NAME",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} cannot be represented as an exact C# target name. ${resolution.reason}`,
  });
  return errorName;
}
