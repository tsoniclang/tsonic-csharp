import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";

export interface CsharpJsSurfaceSourceLibraryPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly mapCall?: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
    sourceMember: SourceLibraryMember,
    host: CsharpJsSurfaceHost,
    options: { readonly phase?: "checking" | "finalization" },
  ) => ExtensionObservation<CheckedCallMappingResult> | undefined;
  readonly getCallMembers?: (
    sourceMember: SourceLibraryMember,
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
    host: CsharpJsSurfaceHost,
  ) => readonly TargetMember[];
  readonly hasCallableProperty?: (sourceMember: SourceLibraryMember) => boolean;
}
