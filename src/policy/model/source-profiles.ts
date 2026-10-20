import type { CsharpSourceProfilePropertyPolicyResult } from "../../target-model/records/source-profile-invocations.js";
import type { ExtensionDiagnostic, SourceFile } from "@tsonic/tsts";
import { type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTargetReceiverRelation } from "../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../types/index.js";
import type { CsharpProviderCallSelectionHost } from "./provider-calls.js";

import type { CsharpSourceProfileDeclarationIdentity, CsharpSourceProfileOwner } from "../identities/selected-source.js";
import type { CsharpSelectedTargetCall, CsharpTargetElementInvocation } from "../../target-model/records/members.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/source-calls.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

export interface CsharpSourceProfileIdentitySelector {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: CsharpSourceProfileDeclarationIdentity["kind"];
  readonly declaringName?: string;
  readonly declaringNames?: readonly string[];
  readonly declarationCardinality?: "single" | "multiple";
  readonly name?: string;
}

export interface CsharpSourceProfileCallPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly inputs: import("../../target-model/records/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
}

export interface CsharpSourceProfilePropertyPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly inputs: import("../../target-model/records/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: ResolvedSourcePropertyAccessInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
  readonly receiverType: TargetTypeRef | undefined;
  readonly readonly: boolean;
}

export interface CsharpSourceProfileElementPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly inputs: import("../../target-model/records/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: ResolvedSourceElementAccessInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
  readonly readonly: boolean;
}

export type CsharpSourceProfileCallPolicyResult =
  | {
      readonly kind: "resolved";
      readonly call: CsharpSelectedTargetCall;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpSourceProfileElementPolicyResult =
  | {
      readonly kind: "resolved";
      readonly targetMember: CsharpTargetMember;
      readonly targetParameterIndex: number;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetElementInvocation;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export interface CsharpSourceProfileCallPolicy {
  readonly inputRequirements?: import("../../target-model/records/source-profile-inputs.js").CsharpSourceProfileInputRequirements;
  readonly finalizeArguments?: true;
  readonly source: CsharpSourceProfileIdentitySelector;
  readonly inheritableConstructor?: CsharpTargetMember;
  select(
    context: CsharpSourceProfileCallPolicyContext,
  ): CsharpSourceProfileCallPolicyResult | undefined;
}

export interface CsharpSourceProfilePropertyPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  select(
    context: CsharpSourceProfilePropertyPolicyContext,
  ): CsharpSourceProfilePropertyPolicyResult | undefined;
}

export interface CsharpSourceProfileElementPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  select(
    context: CsharpSourceProfileElementPolicyContext,
  ): CsharpSourceProfileElementPolicyResult | undefined;
}
