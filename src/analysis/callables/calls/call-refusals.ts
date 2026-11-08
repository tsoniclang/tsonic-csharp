import type { Node } from "@tsonic/tsts";
import type { CsharpTargetCallSelection } from "../../../target-model/records/operations/member-selections.js";

// The diagnostic a non-closed target call selection reports; undefined for a selected call. A Host refusal keeps its
// code, reason and site, with source "tsonic" (R5, I7).
export function csharpTargetCallRefusal(target: CsharpTargetCallSelection):
  { readonly code: string; readonly message: string; readonly evidence?: readonly string[];
    readonly source?: "tsonic"; readonly site?: Node } | undefined {
  switch (target.kind) {
    case "resolved": case "source-owned": return undefined;
    case "refused": return { code: target.refusal.code, message: target.refusal.reason, source: "tsonic", site: target.refusal.site };
    case "rejected": return { code: `TS${target.diagnostic.numericCode}`, message: target.diagnostic.message };
    case "missing": return { code: "CSHARP_TARGET_CALL_NOT_CLOSED", message: target.reason };
    case "conflict": return { code: "CSHARP_TARGET_CALL_IDENTITY_CONFLICT", message: target.reason };
    case "ambiguous": return { code: "CSHARP_TARGET_CALL_AMBIGUOUS", message: target.reason,
      evidence: target.candidates.map(candidate => `candidate=${candidate}`) };
  }
}
