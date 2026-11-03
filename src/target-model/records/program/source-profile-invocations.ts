import type { CsharpTargetReceiverRelation } from "../../identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../types/model.js";
import type { ExtensionDiagnostic, Node } from "@tsonic/tsts";

export type CsharpTargetPropertyInvocation =
  | { readonly kind: "member" }
  | { readonly kind: "receiver-call"; readonly call: CsharpTargetMember }
  | { readonly kind: "array-like"; readonly projection: import("../../conversions/selection.js").CsharpArrayLikeUnionProjection }
  | { readonly kind: "source-name-indexer"; readonly optionalRead: boolean };

export interface CsharpNativePropertyRead {
  readonly declaration: Node;
  readonly member: CsharpTargetMember & { readonly returnType: TargetTypeRef };
  readonly receiver: CsharpTargetReceiverRelation;
  readonly invocation: Extract<CsharpTargetPropertyInvocation, { readonly kind: "member" | "receiver-call" }>;
}

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
