import type {
  ExtensionDiagnostic,
} from "@tsonic/tsts";
import type {
  DotnetProviderDiagnostic,
  DotnetProviderModuleResult,
} from "./provider.js";

export function isDotnetProviderDiagnostic(value: DotnetProviderModuleResult): value is DotnetProviderDiagnostic {
  return "code" in value && "message" in value;
}

export function dotnetProviderDiagnosticToExtensionDiagnostic(
  extensionId: string,
  diagnostic: DotnetProviderDiagnostic,
): ExtensionDiagnostic {
  return dotnetExtensionDiagnostic(extensionId, diagnostic.code, 9200000, diagnostic.message, diagnostic.evidence);
}

export function dotnetExtensionDiagnostic(
  extensionId: string,
  extensionCode: string,
  numericCode: number,
  message: string,
  evidence?: readonly Readonly<Record<string, unknown>>[],
): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
    ...(evidence !== undefined ? { evidence: evidence.map((details) => ({ message: "Provider evidence", details })) } : {}),
  };
}

export function dotnetProviderRequestSliceRequiredDiagnostic(extensionId: string, specifier: string): ExtensionDiagnostic {
  return dotnetExtensionDiagnostic(
    extensionId,
    "DOTNET_PROVIDER_REQUEST_SLICE_REQUIRED",
    9200004,
    `.NET provider module '${specifier}' requires an explicit requested export slice or explicit broad import.`,
    [{ specifier }],
  );
}

export function dotnetProviderRequestedExportMissingDiagnostic(
  extensionId: string,
  specifier: string,
  missingExports: readonly string[],
): ExtensionDiagnostic {
  return dotnetExtensionDiagnostic(
    extensionId,
    "DOTNET_PROVIDER_REQUESTED_EXPORT_MISSING",
    9200005,
    `.NET provider module '${specifier}' did not prove requested export(s): ${missingExports.join(", ")}.`,
    [{ specifier, missingExports }],
  );
}

export function dotnetProviderDeclarationModelInvalidDiagnostic(
  extensionId: string,
  specifier: string,
  error: unknown,
): ExtensionDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const evidence = error instanceof Error && "evidence" in error && typeof error.evidence === "object"
    ? [error.evidence as Readonly<Record<string, unknown>>]
    : [{ specifier, message }];
  return dotnetExtensionDiagnostic(
    extensionId,
    "DOTNET_PROVIDER_DECLARATION_MODEL_INVALID",
    9200006,
    `.NET provider produced an invalid declaration model for '${specifier}': ${message}`,
    evidence,
  );
}
