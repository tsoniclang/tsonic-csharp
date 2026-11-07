import type { CsharpSourceProfilePropertyPolicyResult } from "../../target-model/records/program/source-profile-invocations.js";
import type { ExtensionDiagnostic } from "@tsonic/tsts";
import type {
  CsharpSourceProfileCallSource,
  CsharpSourceProfileElementSource,
  CsharpSourceProfilePropertySource,
} from "../../target-model/records/program/source-profile-inputs.js";
import type { CsharpTargetReceiverRelation } from "../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../types/index.js";
import type { CsharpProviderCallSelectionHost } from "./provider-calls.js";

import type { CsharpSourceProfileDeclarationIdentity, CsharpSourceProfileOwner } from "../identities/selected-source.js";
import type { CsharpSelectedTargetCall, CsharpTargetElementInvocation } from "../../target-model/records/objects/members.js";

// Source-profile policy contexts carry C# views of the Host selections (nextgen C-2542): each view holds the raw Host
// record unchanged (`selection` / `access`) plus published reads only (built by F3 in
// policy/operations/source-profiles/source-profile-sources.ts). The JS meaning of a declaration is `host.facts.profile`.

export interface CsharpSourceProfileIdentitySelector {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: CsharpSourceProfileDeclarationIdentity["kind"];
  readonly declaringName?: string;
  readonly declaringNames?: readonly string[];
  readonly declarationCardinality?: "single" | "multiple";
  readonly name?: string;
}

export interface CsharpSourceProfileCallPolicyContext {
  readonly host: Omit<CsharpProviderCallSelectionHost, "types" | "objectShapes">;
  readonly inputs: import("../../target-model/records/program/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: CsharpSourceProfileCallSource;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
}

export interface CsharpSourceProfilePropertyPolicyContext {
  readonly host: Omit<CsharpProviderCallSelectionHost, "types" | "objectShapes">;
  readonly inputs: import("../../target-model/records/program/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: CsharpSourceProfilePropertySource;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
  readonly receiverType: TargetTypeRef | undefined;
  readonly readonly: boolean;
}

export interface CsharpSourceProfileElementPolicyContext {
  readonly host: Omit<CsharpProviderCallSelectionHost, "types" | "objectShapes">;
  readonly inputs: import("../../target-model/records/program/source-profile-inputs.js").CsharpSourceProfileInputFacts;
  readonly source: CsharpSourceProfileElementSource;
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
  readonly inputRequirements?: import("../../target-model/records/program/source-profile-inputs.js").CsharpSourceProfileInputRequirements;
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
