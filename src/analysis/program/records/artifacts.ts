import type { SourceArtifactFile } from "@tsonic/target-api/analysis";
import type { CsharpSourceArtifactRecords } from "../../../target-model/records/artifacts.js";

export function createCsharpSourceArtifactRecords(files: readonly SourceArtifactFile[]): CsharpSourceArtifactRecords {
  const sealed = Object.freeze([...files]);
  return Object.freeze({ sourceArtifacts: Object.freeze({ get: () => sealed }) });
}
