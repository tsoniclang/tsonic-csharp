import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  TsonicAttributeApplicationFact,
} from "@tsonic/source-core/facts";

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
