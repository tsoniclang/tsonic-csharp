import type { Node } from "@tsonic/tsts";
import type { TsonicClosedArrayStorage } from "@tsonic/source-core/facts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";

export interface CsharpSourceEvidenceAnalysis extends CsharpSourceEvidenceIndex {
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}
