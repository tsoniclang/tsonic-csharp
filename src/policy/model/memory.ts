import type { SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/objects/object-members.js";
import type { CsharpPolicyContext } from "./context.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";

export type CsharpMemoryOutcome<Value> = CsharpRepresentationOutcome<Value>
  | Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }>;

export interface CsharpMemoryAnalysisHost extends CsharpPolicyContext {
  readonly objectMembers: CsharpObjectMemberRecords;
  readonly storageTargetType: CsharpSourceEvidenceIndex["storageTargetType"];
}
