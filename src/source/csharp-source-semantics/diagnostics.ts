import type {
  ExtensionDiagnostic,
  ExtensionEvidence,
} from "@tsonic/tsts";

export function csharpProviderDiagnostic(
  extensionId: string,
  extensionCode: string,
  numericCode: number,
  message: string,
  evidence: readonly ExtensionEvidence[] = [],
): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}
