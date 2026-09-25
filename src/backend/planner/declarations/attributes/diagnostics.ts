import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpAttributeApplication,
} from "../../../../analysis/attributes/application-index.js";

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
