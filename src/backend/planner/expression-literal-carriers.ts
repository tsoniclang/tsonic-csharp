import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  csharpStringTargetType,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";

export function requireCsharpStringRuntimeCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  description: string,
): boolean {
  const carrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (carrier === undefined) {
    const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the string expression.");
    diagnostics.push(unsupportedNodeDiagnostic(node, `${description} requires a finalized target string runtime carrier fact before C# emission. ${detail.reason}`, detail.evidence));
    return false;
  }
  if (!targetTypeRefEquals(carrier, csharpStringTargetType())) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${description} requires a finalized System.String runtime carrier fact before C# emission.`));
    return false;
  }
  return true;
}
