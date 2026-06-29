import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  getCsharpJsSourceLibraryOperationRow,
} from "../member-providers/index.js";

export function csharpJsSourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if (phase === "finalization" || !compilerContextCanRunLifecycleFinalization(context)) {
    return false;
  }
  const row = getCsharpJsSourceLibraryOperationRow(sourceMember);
  if (row === undefined) {
    return true;
  }
  void request;
  void context;
  void host;
  return row.policyKind !== "unsupported";
}

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.host !== undefined;
}
