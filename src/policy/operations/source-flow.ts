import {
  flowStateFactKey,
} from "@tsonic/tsts";
import type {
  FlowStateFact,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";

export type CsharpSourceFlowCallSelection =
  | { readonly kind: "not-source-flow" }
  | {
      readonly kind: "rejected";
      readonly code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED";
      readonly reason: string;
    };

export function selectCsharpSourceFlowCall(
  input: CsharpTranslationContext,
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
): "borrow" | "borrowMut" | "move" {
  switch (flowState.state) {
    case "borrowed-shared":
      return "borrow";
    case "borrowed-mut":
      return "borrowMut";
    case "moved":
      return "move";
  }
}
