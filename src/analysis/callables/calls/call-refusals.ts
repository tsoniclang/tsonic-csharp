import type { CsharpTargetCallSelection } from "../../../target-model/records/operations/member-selections.js";
import { csharpRepresentationDiagnostic } from "../../source-evidence/representations.js";

// The diagnostic a non-closed target call selection reports; undefined for a selected call.
export function csharpTargetCallRefusal(target: CsharpTargetCallSelection):
  { readonly code: string; readonly message: string; readonly source?: string; readonly site?: import("@tsonic/tsts").Node;
    readonly evidence?: readonly string[] } | undefined {
  switch (target.kind) {
    case "resolved": case "source-owned": return undefined;
    case "rejected": return { code: target.diagnostic.publicCode, message: target.diagnostic.message, source: target.diagnostic.extensionId };
    case "source-refused": case "native-refused": {
      const diagnostic = csharpRepresentationDiagnostic(target);
      return { code: diagnostic.code, message: diagnostic.message, source: diagnostic.source, site: diagnostic.sourceNode };
    }
    case "missing": return { code: "CSHARP_TARGET_CALL_NOT_CLOSED", message: target.reason };
    case "conflict": return { code: "CSHARP_TARGET_CALL_IDENTITY_CONFLICT", message: target.reason };
    case "ambiguous": return { code: "CSHARP_TARGET_CALL_AMBIGUOUS", message: target.reason,
      evidence: target.candidates.map(candidate => `candidate=${candidate}`) };
  }
}
