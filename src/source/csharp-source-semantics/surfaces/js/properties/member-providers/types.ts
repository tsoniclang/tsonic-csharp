import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMemberIdentityPolicy,
  SourceLibraryMemberKey,
} from "../../source-library.js";

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

export interface CsharpJsPropertyMemberProvider {
  readonly sourceId: SourceLibraryMemberKey;
  readonly member: CsharpJsPropertyMemberProviderKind;
}

export interface CsharpJsPropertyPrecheckRule {
  readonly sourceId?: SourceLibraryMemberKey;
  readonly identity?: SourceLibraryMemberIdentityPolicy;
  readonly result: CsharpJsPropertyPrecheckResult;
}

export type CsharpJsPropertyPrecheckResult =
  | CsharpJsSourceLibraryPropertyPrecheck
  | { readonly kind: "target-member-exists"; readonly members: readonly TargetMember[] };

export type CsharpJsPropertyMemberProviderKind =
  | { readonly kind: "metadata-row"; readonly members: readonly TargetMember[] }
  | { readonly kind: "collection-member" }
  | { readonly kind: "array-length" };
