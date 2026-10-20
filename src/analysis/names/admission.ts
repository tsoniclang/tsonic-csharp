import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
export function requireCsharpIdentifier(
  value: string,
  diagnostics: TargetDiagnostic[],
  description: string,
): string {
  const identifier = tryCsharpIdentifier(value);
  if (identifier !== undefined) {
    return identifier;
  }
  diagnostics.push({
    code: "CSHARP_INVALID_IDENTIFIER",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} '${value}' is not a valid C# identifier. Add an explicit target name/fact instead of relying on backend name rewriting.`,
  });
  return "__invalid";
}
