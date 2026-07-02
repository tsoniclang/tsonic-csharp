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
  nodeOrSpan?: unknown,
): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
    ...(nodeOrSpan === undefined ? {} : { nodeOrSpan }),
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}
