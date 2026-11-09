import type { SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/objects/object-members.js";
import type { CsharpPolicyContext } from "./context.js";

export type CsharpMemoryOutcome<Value> = CsharpRepresentationOutcome<Value>
  | Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }>;

export interface CsharpMemoryAnalysisHost extends CsharpPolicyContext {
  readonly objectMembers: CsharpObjectMemberRecords;
}
