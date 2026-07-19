import type {
  ExtensionDiagnostic,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  unsupportedAnyOperationCode,
  unsupportedAnyOperationNumericCode,
} from "./diagnostic-constants.js";

export interface OpaqueAnyOperation {
  readonly kind: string;
  readonly description: string;
}

export function csharpOpaqueAnyOperationDiagnostic(
  extensionId: string,
  operation: OpaqueAnyOperation,
  compatibilityMode: TargetTypescriptCompatibilityMode,
  nodeOrSpan: unknown,
): ExtensionDiagnostic {
  const modeDetails = compatibilityMode === "strict-native"
    ? {
        message: `${operation.description} uses TypeScript any in strict-native mode.`,
        reason: "Strict-native mode hard-rejects dynamic TypeScript any operations even if a compatibility surface has produced target operation facts.",
        architecture: "Select typescriptCompatibility: \"compat\" and provide closed TsValue/TsObject/TsFunction operation facts to enable dynamic behavior.",
      }
    : {
        message: `${operation.description} uses TypeScript any in compatibility mode without finalized target operation facts.`,
        reason: "Compatibility mode is selected, but no closed dynamic runtime operation fact exists for this expression.",
        architecture: "A selected compatibility surface must provide an explicit TsValue/TsObject/TsFunction operation fact; backend emission must not infer dynamic behavior from TypeScript any.",
      };
  return csharpProviderDiagnostic(
    extensionId,
    unsupportedAnyOperationCode,
    unsupportedAnyOperationNumericCode,
    modeDetails.message,
    [
      {
        message: "C# dynamic boundary rejected",
        details: modeDetails.reason,
      },
      {
        message: "Required architecture",
        details: modeDetails.architecture,
      },
    ],
    nodeOrSpan,
  );
}
