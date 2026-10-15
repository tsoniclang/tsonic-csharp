import type { Node } from "@tsonic/tsts";

export type CsharpSourceFlowCallSelection =
  | { readonly kind: "not-source-flow" }
  | { readonly kind: "keep-alive"; readonly valueExpression: Node }
  | {
      readonly kind: "rejected";
      readonly code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED" | "CSHARP_KEEP_ALIVE_EVIDENCE_CONFLICT";
      readonly reason: string;
    };
