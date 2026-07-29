import type {
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpProviderCallSelectionHost,
} from "./call-selection.js";
import {
  csharpJsSourceProfileCallPolicies,
  csharpJsSourceProfileElementPolicies,
  csharpJsSourceProfilePropertyPolicies,
} from "./js-source-profile/index.js";
import {
  csharpNativeSourceProfileCallPolicies,
  csharpNativeSourceProfileElementPolicies,
  csharpNativeSourceProfilePropertyPolicies,
} from "./native-source-profile.js";
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
} from "./selection-types.js";
import type {
  SourceFileQueries,
} from "@tsonic/tsts";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileQueries["checker"]["getResolvedPropertyAccessInfo"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileQueries["checker"]["getResolvedElementAccessInfo"]>
>;

const callPolicies = Object.freeze([
  ...csharpNativeSourceProfileCallPolicies,
  ...csharpJsSourceProfileCallPolicies,
]);

const propertyPolicies = Object.freeze([
  ...csharpNativeSourceProfilePropertyPolicies,
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
