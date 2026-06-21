import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import type {
  SemanticOwnership,
} from "./semantic-guard-types.js";

export type {
  OperationSemanticOwnership,
  SemanticOwnership,
} from "./semantic-guard-types.js";

export function pushMissingTargetFactDiagnostic(
  diagnostics: TargetDiagnostic[],
  node: Node,
  message: string,
  ownership: SemanticOwnership,
): void {
  const reasons = ownership.reasons.length === 0
    ? "no provider/source facts and no source-owned declaration"
    : ownership.reasons.join(", ");
  diagnostics.push(unsupportedNodeDiagnostic(node, `${message} Missing finalized target fact evidence: ${reasons}.`));
}

export {
  getCallableSemanticOwnership,
} from "./semantic-callable-ownership.js";
export {
  getSemanticOwnership,
} from "./semantic-general-ownership.js";
export {
  getProviderOperationOwnership,
} from "./semantic-operation-ownership.js";
export {
  isSourceOwnedProjectConstructibleObjectSubject,
  isSourceOwnedProjectShapeSubject,
} from "./semantic-source-ownership.js";
