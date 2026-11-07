import type { Node } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpArrayLikeUnionProjection } from "../../../target-model/conversions/selection.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import { sourceMemberAccess } from "../../program/source-facts.js";
import { sourceProfilePropertyIdentities } from "../source-profiles/policy-selection.js";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../target-model/types/carriers/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";

import { typedArrayNames } from "../../../target-model/types/carriers/js.js";

import { selectCsharpArrayUnionPropertyPlan, selectCsharpArrayUnionElementPlan } from "../../../policy/operations/source-profiles/js/array-unions.js";
const owners: ReadonlySet<string> = new Set(["Array", "ReadonlyArray", "TypedArray", ...typedArrayNames]);

/** A receiver whose published type is a closed sum of array-like arms with one primitive element (Host sum, R6). */
function project(
  host: CsharpProviderCallSelectionHost,
  receiver: Node,
  receiverType: SourceTypeDescriptor,
): CsharpArrayLikeUnionProjection | undefined {
  if (host.facts.sums.sumOf(receiverType) === undefined) return undefined;
  const source = host.types.represent(receiverType, receiver, "value");
  if (source.kind === "csharp-refused") return undefined;
  const arms = getCsharpRuntimeUnionArms(source, host.typeDefinitions);
  const element = csharpArrayLikeElement(source, host.typeDefinitions);
  return arms === undefined || element?.kind !== "source-primitive"
    ? undefined : { source, target: csharpArrayLikeTargetType(element), conversion: { kind: "array-like-union", arms } };
}

function owned(identity: CsharpSourceProfileDeclarationIdentity | undefined): boolean {
  return identity?.owner === "js" && identity.declaringName !== undefined && owners.has(identity.declaringName);
}

export function selectCsharpArrayUnionProperty(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const source = sourceMemberAccess(host.facts, access);
  if (source.optionalChain || source.access !== "read") return undefined;
  const projection = project(host, source.receiver, source.receiverType);
  if (projection === undefined) return undefined;
  const identities = sourceProfilePropertyIdentities(host, access);
  if (identities.length === 0 || identities.some(identity => !owned(identity) || identity.kind !== "member" || identity.name !== "length")) return undefined;
  return selectCsharpArrayUnionPropertyPlan(projection);
}

export function selectCsharpArrayUnionElement(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): CsharpSourceProfileElementPolicyResult | undefined {
  const source = host.facts.values.elementAccess(access);
  if (source.optionalChain || source.access !== "read") return undefined;
  const projection = project(host, source.receiver, source.receiverType);
  if (projection === undefined) return undefined;
  const indexType = host.types.represent(source.index, source.node, "value");
  if (indexType.kind === "csharp-refused") return undefined;
  const indexes = host.facts.objects.indexes(source.receiverType);
  if (indexes.length === 0 || indexes.some(index => {
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, index.declaration);
    return !owned(identity) || identity?.kind !== "indexer";
  })) return undefined;
  return selectCsharpArrayUnionElementPlan(projection, indexType);
}
