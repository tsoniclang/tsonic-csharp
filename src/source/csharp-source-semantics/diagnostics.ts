import type { ExtensionDiagnostic } from "@tsonic/tsts";

export function csharpProviderDiagnostic(extensionId: string, extensionCode: string, numericCode: number, message: string): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
  };
}
