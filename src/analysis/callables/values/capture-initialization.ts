import type { Node } from "@tsonic/tsts";
import type { SourceAnalysisFacts } from "@tsonic/target-api/source";
import type { CsharpCaptureInitialization } from "../../../target-model/types/model.js";

export function csharpCapturedBindingInitialization(
  declaration: Node,
  analyses: Pick<SourceAnalysisFacts, "capturedBeforeInitialization" | "capturedBeforeFirstWrite">,
): CsharpCaptureInitialization {
  return analyses.capturedBeforeInitialization(declaration) || analyses.capturedBeforeFirstWrite(declaration) ? "deferred" : "initialized";
}
