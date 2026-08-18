import type {
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpProviderCallSelectionHost,
} from "../selection/call-selection.js";
import {
  csharpJsSourceProfileCallPolicies,
  csharpJsSourceProfileElementPolicies,
  csharpJsSourceProfilePropertyPolicies,
} from "./js/index.js";
import {
  csharpNativeSourceProfileCallPolicies,
  csharpNativeSourceProfileElementPolicies,
  csharpNativeSourceProfilePropertyPolicies,
} from "./native-source-profile.js";
import {
  csharpGeneratorSourceProfileCallPolicies,
  csharpGeneratorSourceProfilePropertyPolicies,
} from "./generator-source-profile.js";
import type {
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileElementPolicyResult,
  CsharpSourceProfilePropertyPolicyResult,
} from "./source-profile-policy.js";
import {
  selectCsharpSourceProfileCallPolicy,
  selectCsharpSourceProfileElementPolicy,
  selectCsharpSourceProfilePropertyPolicy,
} from "./source-profile-policy.js";
import type {
  ResolvedSourceCallInfo,
} from "../selection/selection-types.js";
type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedPropertyAccessInfo"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedElementAccessInfo"]>
>;

const callPolicies = Object.freeze([
  ...csharpNativeSourceProfileCallPolicies,
  ...csharpGeneratorSourceProfileCallPolicies,
  ...csharpJsSourceProfileCallPolicies,
]);

const propertyPolicies = Object.freeze([
  ...csharpNativeSourceProfilePropertyPolicies,
  ...csharpGeneratorSourceProfilePropertyPolicies,
  ...csharpJsSourceProfilePropertyPolicies,
]);

const elementPolicies = Object.freeze([
  ...csharpNativeSourceProfileElementPolicies,
  ...csharpJsSourceProfileElementPolicies,
]);

export function selectCsharpComposedSourceProfileCall(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileCallPolicyResult | undefined {
  return selectCsharpSourceProfileCallPolicy(
    host,
    source,
    sourceFile,
    callPolicies,
  );
}

export function selectCsharpComposedSourceProfileProperty(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  return selectCsharpSourceProfilePropertyPolicy(
    host,
    source,
    sourceFile,
    propertyPolicies,
  );
}

export function selectCsharpComposedSourceProfileElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileElementPolicyResult | undefined {
  return selectCsharpSourceProfileElementPolicy(
    host,
    source,
    sourceFile,
    elementPolicies,
  );
}
