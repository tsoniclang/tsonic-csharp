import type { SourceArtifactFile } from "@tsonic/target-api/analysis";

export interface CsharpSourceArtifactRecords {
  readonly sourceArtifacts: { readonly get: () => readonly SourceArtifactFile[] };
}
