import type {
  SourceFile,
  Node,
  AstReader,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpArrayUnionElement, selectCsharpArrayUnionProperty } from "./js/array-unions.js";
import { selectCsharpIndexedRecordElement, selectCsharpIndexedRecordProperty } from "../collections/indexed-records.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpProviderCallSelectionHost,
} from "../members/selection/call-selection.js";
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
import {
  csharpErrorSourceProfileCallPolicies,
  csharpErrorSourceProfilePropertyPolicies,
} from "./error-source-profile.js";
import type {
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileElementPolicyResult,
  CsharpSourceProfilePropertyPolicyResult,
} from "./source-profile-policy.js";
import { csharpSourceProfileDeclarationIdentity } from "./source-profile-identity.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import {
  sourceProfileIdentityMatches,
  selectCsharpSourceProfileCallPolicy,
  selectCsharpSourceProfileElementPolicy,
  selectCsharpSourceProfilePropertyPolicy,
} from "./source-profile-policy.js";
import type {
  ResolvedSourceCallInfo,
} from "../members/selection/selection-types.js";
type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

const callPolicies = Object.freeze([
  ...csharpErrorSourceProfileCallPolicies,
  ...csharpNativeSourceProfileCallPolicies,
  ...csharpGeneratorSourceProfileCallPolicies,
  ...csharpJsSourceProfileCallPolicies,
]);

const propertyPolicies = Object.freeze([
  ...csharpErrorSourceProfilePropertyPolicies,
  ...csharpNativeSourceProfilePropertyPolicies,
  ...csharpGeneratorSourceProfilePropertyPolicies,
  ...csharpJsSourceProfilePropertyPolicies,
]);

const elementPolicies = Object.freeze([
  ...csharpNativeSourceProfileElementPolicies,
  ...csharpJsSourceProfileElementPolicies,
]);

export function selectCsharpSourceProfileConstructor(
  host: {
    readonly ast: AstReader;
    readonly sourceFacts?: ReadonlySourceFactResolver;
    semanticsFor(node: Node): SourceFileSemantics;
  },
  declaration: Node,
): readonly CsharpTargetMember[] {
  const identity = csharpSourceProfileDeclarationIdentity(host.ast,
    host.semanticsFor(declaration), host.sourceFacts, declaration);
  if (identity === undefined || identity.kind !== "construct") return [];
  return callPolicies.flatMap(policy => policy.inheritableConstructor === undefined ||
    !sourceProfileIdentityMatches(policy.source, identity) ? [] : [policy.inheritableConstructor]);
}

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
  const union = selectCsharpArrayUnionProperty(host, source, sourceFile);
  if (union !== undefined) return union;
  const record = selectCsharpIndexedRecordProperty(host, source, sourceFile);
  if (record !== undefined) return record;
  return selectCsharpSourceProfilePropertyForCarrier(
    host,
    source,
    sourceFile,
    undefined,
  );
}

export function selectCsharpSourceProfilePropertyForCarrier(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
  receiverType: TargetTypeRef | undefined,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  return selectCsharpSourceProfilePropertyPolicy(host, source, sourceFile, propertyPolicies, receiverType);
}

export function selectCsharpComposedSourceProfileElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileElementPolicyResult | undefined {
  const union = selectCsharpArrayUnionElement(host, source, sourceFile);
  if (union !== undefined) return union;
  const record = selectCsharpIndexedRecordElement(host, source, sourceFile);
  if (record !== undefined) return record;
  return selectCsharpSourceProfileElementPolicy(
    host,
    source,
    sourceFile,
    elementPolicies,
  );
}
