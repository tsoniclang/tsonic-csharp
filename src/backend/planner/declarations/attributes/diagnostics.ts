import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAttribute } from "../../../target-ast/roslyn/index.js";
import type {
  CsharpAttributeApplication,
} from "../../../../analysis/attributes/application-index.js";

export function unsupportedAttributeTarget(
  _attribute: CsharpAttributeApplication,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute["type"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: "C# attribute type must carry an AST type or value subject from finalized source-core facts.",
  });
  return { kind: "InvalidType", reason: "unsupported attribute target" };
}

export function unsupportedAttributeArgument(
  _attribute: CsharpAttributeApplication,
  diagnostics: TargetDiagnostic[],
): void {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: "C# attribute argument must carry an AST expression subject from finalized source-core facts.",
  });
}

export function attributeApplicationDiagnostic(
  _attribute: CsharpAttributeApplication,
  message: string,
): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute application ${message}`,
  };
}
