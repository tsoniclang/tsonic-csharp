import type { Node } from "@tsonic/tsts";
import type { TsonicClosedArrayStorage } from "@tsonic/source-core/facts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";

/**
 * Result of source-evidence analysis. Every analysis reads the index. The closed-array inspector
 * runs a bounded source worklist, so it is not part of the index: only storage sealing receives it,
 * for native backing.
 */
export interface CsharpSourceEvidenceResult {
  readonly index: CsharpSourceEvidenceIndex;
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}

/** Evidence given to storage sealing: the index plus the closed-array inspector native backing reads. */
export interface CsharpSourceEvidenceAnalysis extends CsharpSourceEvidenceIndex {
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}
