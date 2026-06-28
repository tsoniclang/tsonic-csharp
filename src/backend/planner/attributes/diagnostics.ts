import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpAttribute } from "../../roslyn/syntax.js";
import type {
  CsharpAttributeApplicationFact,
} from "../../../source/csharp-facts.js";

export function unsupportedAttributeTarget(
  attribute: CsharpAttributeApplicationFact,
  diagnostics: TargetDiagnostic[],
): CsharpAttribute["type"] {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute target '${attribute.attributeName}' must carry an AST type or value subject from finalized TSTS facts.`,
  });
  return { kind: "InvalidType", reason: "unsupported attribute target" };
}

export function unsupportedAttributeArgument(
  attribute: CsharpAttributeApplicationFact,
  diagnostics: TargetDiagnostic[],
): void {
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_FACT",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute '${attribute.attributeName}' argument must carry an AST expression subject from finalized TSTS facts.`,
  });
}

export function attributeApplicationDiagnostic(
  attribute: CsharpAttributeApplicationFact,
  message: string,
): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute application '${attribute.attributeName}' ${message}`,
  };
}
