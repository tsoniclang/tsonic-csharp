import type { Node } from "@tsonic/tsts";
import type { SourceOperation, SourcePresence, SourceProgramFacts, SourceSignatureIdentity, SourceTypeParameter } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome, CsharpRepresentedType, CsharpRepresentedTypeParameter } from "../../target-model/types/representation.js";
import type { CsharpRepresentedApplication, CsharpSourceRepresentationQueries } from "../../analysis/source-evidence/representations.js";
import type { CsharpRepresentedMemberUse } from "../../analysis/source-evidence/member-use.js";

export interface CsharpRepresentedStorage {
  readonly source: Extract<
    Extract<ReturnType<SourceProgramFacts["protocols"]["storage"]>, { readonly kind: "resolved" }>["value"],
    { readonly kind: "present" }
  >["value"];
  readonly value: CsharpRepresentedType;
}

export interface CsharpTypeQueries extends CsharpSourceRepresentationQueries {
  value(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedType>;
  declaredSlot(declaration: Node): ReturnType<typeof import("../../analysis/source-evidence/representations.js").representCsharpDeclaredSlot>;
  storage(occurrence: Node): CsharpRepresentationOutcome<SourcePresence<CsharpRepresentedStorage>>;
  callableReturn(signature: SourceSignatureIdentity, site: Node): CsharpRepresentationOutcome<CsharpRepresentedType>;
  application(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedApplication>;
  memberUse(occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedMemberUse>;
  operation(occurrence: Node): CsharpRepresentationOutcome<SourceOperation>;
  parameter(original: SourceTypeParameter, site: Node): CsharpRepresentationOutcome<CsharpRepresentedTypeParameter>;
}
