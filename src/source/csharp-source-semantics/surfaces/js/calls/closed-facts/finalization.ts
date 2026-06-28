import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
} from "../../target-member-metadata.js";
import {
  getCsharpJsSourceLibraryOperationRow,
  operationRowClosedFactsStatus,
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
  if (row.policyKind === "unsupported") {
    return false;
  }
  const status = operationRowClosedFactsStatus(
    row,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
    request,
    context,
    host,
  );
  return status.kind !== "conflict";
}

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.host !== undefined;
}
