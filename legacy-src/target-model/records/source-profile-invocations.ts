import type { CsharpTargetReceiverRelation } from "../identities/provider-relations.js";
import type { CsharpTargetMember } from "../types/model.js";
import type { ExtensionDiagnostic } from "@tsonic/tsts";

export type CsharpTargetPropertyInvocation =
  | { readonly kind: "member" }
  | { readonly kind: "receiver-call" }
  | { readonly kind: "array-like"; readonly projection: import("../conversions/selection.js").CsharpArrayLikeUnionProjection }
  | { readonly kind: "source-name-indexer"; readonly optionalRead: boolean };

export type CsharpSourceProfilePropertyPolicyResult =
  | {
      readonly kind: "resolved";
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetPropertyInvocation;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };
