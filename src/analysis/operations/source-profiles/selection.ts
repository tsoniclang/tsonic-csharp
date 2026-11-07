import type { Node, AstReader, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpArrayUnionElement, selectCsharpArrayUnionProperty } from "../members/number-array-unions.js";
import { selectCsharpIndexedRecordElement, selectCsharpIndexedRecordProperty } from "../collections/indexed-records.js";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
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
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";

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
    readonly facts: SourceProgramFacts;
  },
  declaration: Node,
): readonly CsharpTargetMember[] {
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, declaration);
  if (identity === undefined || identity.kind !== "construct") return [];
  return callPolicies.flatMap(policy => {
    if (policy.inheritableConstructor === undefined || !sourceProfileIdentityMatches(policy.source, identity)) return [];
    const published = host.providers.publishNativeIdentities(policy.inheritableConstructor);
    return published.kind === "resolved" ? [published.value] : [];
  });
}

/** Profile selection for a call, `new` or tagged template the Host selected (facts.selections.call). */
export function selectCsharpComposedSourceProfileCall(
  host: CsharpProviderCallSelectionHost,
  call: Node,
): CsharpSourceProfileCallPolicyResult | undefined {
  return selectCsharpSourceProfileCallPolicy(host, call, callPolicies);
}

/** Profile selection for a member access the Host selected (facts.selections.memberAccess). */
export function selectCsharpComposedSourceProfileProperty(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  return selectCsharpArrayUnionProperty(host, access) ?? selectCsharpIndexedRecordProperty(host, access) ??
    selectCsharpSourceProfilePropertyForCarrier(host, access, undefined);
}

export function selectCsharpSourceProfilePropertyForCarrier(
  host: CsharpProviderCallSelectionHost,
  access: Node,
  receiverType: TargetTypeRef | undefined,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  return selectCsharpSourceProfilePropertyPolicy(host, access, propertyPolicies, receiverType);
}

/** Profile selection for an element access the Host selected (facts.values.elementAccess). */
export function selectCsharpComposedSourceProfileElement(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfileElementPolicyResult | undefined {
  return selectCsharpArrayUnionElement(host, access) ?? selectCsharpIndexedRecordElement(host, access) ??
    selectCsharpSourceProfileElementPolicy(host, access, elementPolicies);
}
