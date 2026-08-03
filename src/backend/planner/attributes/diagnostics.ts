import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpAttribute } from "../../roslyn/syntax.js";
import type {
  TsonicAttributeApplicationFact,
} from "@tsonic/source-core";

export function unsupportedAttributeTarget(
  _attribute: TsonicAttributeApplicationFact,
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
  _attribute: TsonicAttributeApplicationFact,
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
  _attribute: TsonicAttributeApplicationFact,
  message: string,
): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION",
    category: "error",
    source: "tsonic-csharp",
    message: `C# attribute application ${message}`,
  };
}
