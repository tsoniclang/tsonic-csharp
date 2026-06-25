import type {
  FlowStateFact,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";

export function unsupportedCsharpSourceFlowMarkerDiagnostic(
  extensionId: string,
  flowState: FlowStateFact,
): ReturnType<typeof csharpProviderDiagnostic> {
  return csharpProviderDiagnostic(
    extensionId,
    "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
    9100135,
    `C# target does not implement source flow marker '${sourceFlowMarkerName(flowState.state)}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`,
  );
}

export function sourceFlowMarkerName(state: FlowStateFact["state"]): string {
  switch (state) {
    case "borrowed-shared":
      return "borrow";
    case "borrowed-mut":
      return "borrowMut";
    case "moved":
      return "move";
    default:
      return state;
  }
}
