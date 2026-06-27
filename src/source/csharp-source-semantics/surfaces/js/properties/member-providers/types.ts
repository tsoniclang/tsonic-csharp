import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import type {
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
  readonly receiverFacts?: JsSurfacePropertyReceiverFacts;
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
    readonly kind: "collection-metadata";
  }
  | {
    readonly kind: "receiver-member";
    readonly members: readonly JsSurfaceReceiverPropertyMember[];
  };

export interface JsSurfacePropertyTargetProviderRequest {
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly receiverType?: TargetTypeRef;
}

export interface JsSurfacePropertyReceiverFacts {
  readonly seedRequired?: boolean;
  readonly finalCarrierSelection?: boolean;
  readonly requirement?: JsSurfacePropertyReceiverRequirement;
}

export type JsSurfacePropertyReceiverRequirement =
  | { readonly kind: "always" }
  | { readonly kind: "array-like" }
  | { readonly kind: "host"; readonly predicate: JsSurfacePropertyHostReceiverPredicate }
  | { readonly kind: "target-type-id"; readonly id: string }
  | { readonly kind: "target-feature"; readonly feature: "read-only-indexable" };

export type JsSurfacePropertyHostReceiverPredicate =
  | keyof Pick<CsharpJsSurfaceHost, "isCsharpStringType">
  | "isCsharpBooleanTargetType";

export interface JsSurfaceReceiverPropertyMember {
  readonly receiver: JsSurfaceReceiverPropertySelector;
  readonly member: TargetMember;
  readonly useReceiverAsDeclaringType?: boolean;
}

export type JsSurfaceReceiverPropertySelector =
  | { readonly kind: "target-array" }
  | { readonly kind: "target-id"; readonly id: string }
  | { readonly kind: "target-feature"; readonly feature: "read-only-indexable" };
