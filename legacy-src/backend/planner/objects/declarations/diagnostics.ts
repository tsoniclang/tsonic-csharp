import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";

export function pushObjectShapeDeclarationDiagnostic(
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
  message: string,
): void {
  if (diagnostics !== undefined && diagnosticSubject !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
  }
}
