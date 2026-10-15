import type { Node } from "@tsonic/tsts";
import type { TsonicClosedArrayStorage } from "@tsonic/source-core/facts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";

export interface CsharpSourceEvidenceResult {
  readonly index: CsharpSourceEvidenceIndex;
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}

export interface CsharpSourceEvidenceAnalysis extends CsharpSourceEvidenceIndex {
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}
