import type { TargetCapabilityContribution } from "@tsonic/target-api/provider";
import type { ExtensionDiagnostic } from "@tsonic/tsts";
import type {
  CsharpProviderTargetRejection,
  CsharpProviderTargetRelation,
} from "../identities/provider-relations.js";
import type { CsharpTargetBindingFact, TargetTypeRef } from "../types/model.js";
import type { TargetBindingFact } from "../types/model.js";
import type { CsharpNativeTargetBindingFact } from "../types/native-inheritance.js";

export type CsharpProviderBindingResolution =
  | { readonly kind: "resolved"; readonly binding: TargetBindingFact }
  | { readonly kind: "missing" }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic };

export type CsharpProviderBindingLookupPurpose = "ordinary" | "inheritance";

export type CsharpProviderNativeBindingResolution =
  | { readonly kind: "resolved"; readonly binding: CsharpNativeTargetBindingFact }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic };

export interface CsharpTargetBinaryExecutionDriver {
  readonly id: string;
  readonly declaringType: TargetTypeRef;
  readonly runMethodName: string;
  readonly runWithEntrypointMethodName: string;
}

export const csharpProviderPolicyContributionKind = "csharp-provider-policy";

export interface CsharpProviderPolicyContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpProviderPolicyContributionKind;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly targetBindings: readonly CsharpTargetBindingFact[];
  readonly relations: readonly CsharpProviderTargetRelation[];
  readonly rejections: readonly CsharpProviderTargetRejection[];
  readonly binaryExecutionDriver?: CsharpProviderBinaryExecutionDriver;
}

export type CsharpProviderBinaryExecutionDriver = CsharpTargetBinaryExecutionDriver;
