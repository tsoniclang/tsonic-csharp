import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  csharpJsSourceLibraryCallReceiverHasClosedFacts,
} from "../policy.js";

export function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  return csharpJsSourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host);
}
