import type { CsharpProviderArgumentAdapter } from "../conversions/selection.js";
import type { CsharpTargetBindingFact, CsharpTargetMember } from "../types/model.js";
import type { ArgumentPassingMode, ExtensionDiagnostic, ProviderMemberKey } from "@tsonic/tsts";

export type CsharpProviderSourceIdentity =
  | CsharpProviderTypeSourceIdentity
  | CsharpProviderValueSourceIdentity
  | CsharpProviderMemberSourceIdentity
  | CsharpProviderSignatureSourceIdentity;

export interface CsharpProviderTargetRejection {
  readonly source: CsharpProviderSourceIdentity;
  readonly diagnostic: CsharpProviderTargetRejectionDiagnostic;
}

export interface CsharpProviderTargetRejectionDiagnostic extends Pick<
  ExtensionDiagnostic,
  "extensionId" | "extensionCode" | "numericCode" | "message"
> {
  readonly category: "error";
  readonly evidence?: readonly { readonly message: string }[];
}

export type CsharpTargetReceiverRelation =
  | { readonly kind: "none" }
  | { readonly kind: "instance" }
  | {
      readonly kind: "target-parameter";
      readonly targetParameterIndex: number;
    };

export type CsharpProviderTargetRelation =
  | {
      readonly kind: "type";
      readonly source: CsharpProviderTypeSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly objectLiteralConstruction?: CsharpProviderObjectLiteralConstruction;
    }
  | {
      readonly kind: "value";
      readonly source: CsharpProviderValueSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
    }
  | {
      readonly kind: "member";
      readonly source: CsharpProviderMemberSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly bindingTypeArgumentSource: Exclude<
        CsharpProviderBindingTypeArgumentSource,
        "selected-operation-type-arguments"
      >;
    }
  | {
      readonly kind: "signature";
      readonly source: CsharpProviderSignatureSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly parameters: readonly CsharpProviderParameterRelation[];
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly bindingTypeArgumentSource: CsharpProviderBindingTypeArgumentSource;
      readonly methodTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly invocationTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly selectedTypeParameterCount: number;
    };

export interface CsharpProviderTypeSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "type";
}

export interface CsharpProviderTypeParameterRelation {
  readonly sourceTypeParameterIndex: number;
  readonly targetTypeParameterIndex: number;
}

export interface CsharpProviderObjectLiteralConstruction {
  readonly kind: "object-initializer";
}

export interface CsharpProviderValueSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "value";
}

export interface CsharpProviderMemberSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "member";
  readonly memberId: string;
  readonly memberStatic: boolean;
  readonly memberKey: ProviderMemberKey;
}

export type CsharpProviderBindingTypeArgumentSource =
  | "receiver"
  | "result"
  | "callee"
  | "selected-operation-type-arguments";

export interface CsharpProviderSignatureSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "signature";
  readonly memberId?: string;
  readonly memberStatic?: boolean;
  readonly memberKey?: ProviderMemberKey;
  readonly signatureId: string;
}

export interface CsharpProviderParameterRelation {
  readonly sourceParameterIndex: number;
  readonly targetParameterIndex: number;
  readonly sourcePassingMode: ArgumentPassingMode;
  readonly targetPassingMode: ArgumentPassingMode;
  readonly sourceAcceptsOmission: boolean;
  readonly targetAcceptsOmission: boolean;
  readonly sourceRest: boolean;
  readonly targetParamsArray: boolean;
  readonly argumentAdapter?: CsharpProviderArgumentAdapter;
}

export interface CsharpProviderSourceIdentityBase {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly providerModuleId: string;
  readonly moduleSpecifier: string;
  readonly exportId: string;
  readonly exportName: string;
}
