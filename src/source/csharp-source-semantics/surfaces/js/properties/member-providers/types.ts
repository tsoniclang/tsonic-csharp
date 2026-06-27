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
  readonly member: CsharpJsPropertyMemberProviderValue;
}

export interface CsharpJsPropertyPrecheckRule {
  readonly sourceId?: SourceLibraryMemberKey;
  readonly identity?: SourceLibraryMemberIdentityPolicy;
  readonly result: CsharpJsPropertyPrecheckResult;
}

export type CsharpJsPropertyPrecheckResult =
  | CsharpJsSourceLibraryPropertyPrecheck
  | { readonly kind: "target-member-exists"; readonly members: readonly TargetMember[] };

export interface CsharpJsPropertyMemberProviderValue {
  readonly members?: readonly TargetMember[];
  readonly receiverMembers?: readonly CsharpJsReceiverPropertyMember[];
}

export interface CsharpJsReceiverPropertyMember {
  readonly receiver: CsharpJsReceiverPropertySelector;
  readonly member: TargetMember;
  readonly useReceiverAsDeclaringType?: boolean;
}

export type CsharpJsReceiverPropertySelector =
  | { readonly kind: "target-array" }
  | { readonly kind: "target-id"; readonly id: string }
  | { readonly kind: "target-feature"; readonly feature: "read-only-indexable" };
