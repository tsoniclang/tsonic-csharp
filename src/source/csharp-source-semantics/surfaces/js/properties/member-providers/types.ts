import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  JsSurfaceSelectedSourceIdentity,
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

export interface JsSurfacePropertyRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly precheck?: JsSurfacePropertyPrecheck;
  readonly targetProviders?: readonly JsSurfacePropertyTargetProvider[];
}

export type JsSurfacePropertyPrecheck =
  | Exclude<CsharpJsSourceLibraryPropertyPrecheck, "continue">
  | {
    readonly kind: "target-member-exists";
    readonly targetProvider: JsSurfacePropertyTargetProvider;
  };

export type JsSurfacePropertyTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "contextual-metadata";
    readonly resolver: JsSurfacePropertyTargetProviderResolver;
  }
  | {
    readonly kind: "semantic-exception";
    readonly resolver: JsSurfacePropertyTargetProviderResolver;
  };

export interface JsSurfacePropertyTargetProviderResolver {
  readonly id: string;
  readonly selectTargetMembers: (request: JsSurfacePropertyTargetProviderRequest) => readonly TargetMember[];
}

export interface JsSurfacePropertyTargetProviderRequest {
  readonly sourceMember: SourceLibraryMember;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly receiverType?: TargetTypeRef;
}

export interface JsSurfaceReceiverPropertyMember {
  readonly receiver: JsSurfaceReceiverPropertySelector;
  readonly member: TargetMember;
  readonly useReceiverAsDeclaringType?: boolean;
}

export type JsSurfaceReceiverPropertySelector =
  | { readonly kind: "target-array" }
  | { readonly kind: "target-id"; readonly id: string }
  | { readonly kind: "target-feature"; readonly feature: "read-only-indexable" };
