import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

export interface CsharpJsPropertyMemberProvider {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly excludedIdentity?: SourceLibraryMemberIdentityPolicy;
  readonly member: CsharpJsPropertyMemberProviderKind;
}

export interface CsharpJsPropertyPrecheckRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly result: CsharpJsPropertyPrecheckResult;
}

export type CsharpJsPropertyPrecheckResult =
  | CsharpJsSourceLibraryPropertyPrecheck
  | { readonly kind: "target-member-exists"; readonly members: CsharpJsPropertyTargetMemberSet };

export type CsharpJsPropertyMemberProviderKind =
  | { readonly kind: "metadata-by-source-name"; readonly members: CsharpJsPropertyTargetMemberSet }
  | { readonly kind: "collection-size" }
  | { readonly kind: "string-length" }
  | { readonly kind: "array-length" };

export interface CsharpJsPropertyTargetMemberSet {
  readonly get: (sourceName: string) => readonly TargetMember[];
}

export type CsharpJsPropertyTargetMemberResolver = (
  sourceName: string,
  receiverType: TargetTypeRef | undefined,
) => TargetMember | undefined;
