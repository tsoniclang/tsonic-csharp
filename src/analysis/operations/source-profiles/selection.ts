import type { SourceFile, Node, AstReader, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpArrayUnionElement, selectCsharpArrayUnionProperty } from "../members/number-array-unions.js";
import { selectCsharpIndexedRecordElement, selectCsharpIndexedRecordProperty } from "../collections/indexed-records.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { csharpJsSourceProfileCallPolicies, csharpJsSourceProfileElementPolicies, csharpJsSourceProfilePropertyPolicies } from "../../../policy/operations/source-profiles/js/index.js";
import { csharpNativeSourceProfileCallPolicies, csharpNativeSourceProfileElementPolicies, csharpNativeSourceProfilePropertyPolicies } from "../../../policy/operations/source-profiles/native-source-profile.js";
import { csharpGeneratorSourceProfileCallPolicies, csharpGeneratorSourceProfilePropertyPolicies } from "../../../policy/operations/source-profiles/generator-source-profile.js";
import { csharpErrorSourceProfileCallPolicies, csharpErrorSourceProfilePropertyPolicies } from "../../../policy/operations/source-profiles/error-source-profile.js";
import { csharpPromiseSourceProfileCallPolicies } from "../../../policy/operations/source-profiles/promise-source-profile.js";
import type { CsharpSourceProfileCallPolicyResult, CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import { sourceProfileIdentityMatches } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import { selectCsharpSourceProfileCallPolicy, selectCsharpSourceProfileElementPolicy, selectCsharpSourceProfilePropertyPolicy } from "./policy-selection.js";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/calls/source-calls.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

const callPolicies = Object.freeze([
  ...csharpErrorSourceProfileCallPolicies,
  ...csharpPromiseSourceProfileCallPolicies,
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
    readonly providers: CsharpProviderRelationResolver;
    semanticsFor(node: Node): SourceFileSemantics;
  },
  declaration: Node,
): readonly CsharpTargetMember[] {
  const identity = csharpSourceProfileDeclarationIdentity(host.ast,
    host.semanticsFor(declaration), host.sourceFacts, declaration);
  if (identity === undefined || identity.kind !== "construct") return [];
  return callPolicies.flatMap(policy => {
    if (policy.inheritableConstructor === undefined || !sourceProfileIdentityMatches(policy.source, identity)) return [];
    const published = host.providers.publishNativeIdentities(policy.inheritableConstructor);
    return published.kind === "resolved" ? [published.value] : [];
  });
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
