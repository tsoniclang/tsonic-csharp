import {
  flowStateFactKey,
} from "@tsonic/tsts";
import type {
  FlowStateFact,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";

export type CsharpSourceFlowCallSelection =
  | { readonly kind: "not-source-flow" }
  | {
      readonly kind: "rejected";
      readonly code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED";
      readonly reason: string;
    };

export function selectCsharpSourceFlowCall(
  input: CsharpPolicyContext,
  call: Node,
): CsharpSourceFlowCallSelection {
  const flowState = input.sourceFacts?.getFact(call, flowStateFactKey);
  return flowState === undefined
    ? { kind: "not-source-flow" }
    : {
        kind: "rejected",
        code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
        reason:
          `C# target does not implement source flow marker '${sourceFlowMarkerName(flowState)}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`,
      };
}

function sourceFlowMarkerName(
  flowState: FlowStateFact,
): "shared-borrow" | "mutable-borrow" | "move" {
  switch (flowState.state) {
    case "borrowed-shared":
      return "shared-borrow";
    case "borrowed-mut":
      return "mutable-borrow";
    case "moved":
      return "move";
  }
}
