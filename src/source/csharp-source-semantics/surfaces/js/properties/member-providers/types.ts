import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

export interface CsharpJsPropertyMemberResolver {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly excludedIdentity?: SourceLibraryMemberIdentityPolicy;
  readonly resolve: (sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined) => TargetMember | undefined;
}

export interface CsharpJsPropertyPrecheckRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly result: (sourceMember: SourceLibraryMember) => CsharpJsSourceLibraryPropertyPrecheck;
}
