import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  getCsharpJsSourceLibraryCallMembers,
} from "../policy.js";

export function getSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<typeof getCsharpJsSourceLibraryCallMembers> {
  return getCsharpJsSourceLibraryCallMembers(sourceMember, request, context, host);
}
