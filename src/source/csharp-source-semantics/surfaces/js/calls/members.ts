import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  getCsharpJsSourceLibraryCallMembersFromProviders,
} from "./member-providers/index.js";

export function getSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<typeof getCsharpJsSourceLibraryCallMembersFromProviders> {
  return getCsharpJsSourceLibraryCallMembersFromProviders(sourceMember, request, context, host);
}
