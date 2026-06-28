import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "../../../../target-types.js";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import {
  getCsharpArrayLikeElementType,
} from "../../arrays.js";
import {
  isCsharpBooleanTargetType,
} from "../../booleans.js";
import {
  collectionTargetMembersForSelectedIdentity,
} from "../../collection-target-metadata/index.js";
import {
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  jsSurfacePropertyRows,
} from "./target-member-rows.js";
import type {
  CsharpJsSourceLibraryPropertyPrecheck,
  JsSurfacePropertyHostReceiverPredicate,
  JsSurfacePropertyPrecheck,
  JsSurfacePropertyReceiverRequirement,
  JsSurfacePropertyRow,
  JsSurfacePropertyTargetProvider,
  JsSurfacePropertyTargetProviderRequest,
  JsSurfaceReceiverPropertyMember,
  JsSurfaceReceiverPropertySelector,
} from "./types.js";

export function getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const row = propertyRowForSelectedIdentity(selectedIdentity);
  return row === undefined
    ? undefined
    : singlePropertyMember(propertyMembersFromRow(row, { selectedIdentity, receiverType }));
}

export function csharpJsSourceLibraryPropertyPrecheck(selectedIdentity: JsSurfaceSelectedSourceIdentity): CsharpJsSourceLibraryPropertyPrecheck {
  const row = propertyRowForSelectedIdentity(selectedIdentity);
  return row?.precheck === undefined
    ? "continue"
    : propertyPrecheckResult(row.precheck, { selectedIdentity });
}

export function csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return propertyRowForSelectedIdentity(selectedIdentity)?.receiverFacts?.seedRequired === true;
}

export function csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return propertyRowForSelectedIdentity(selectedIdentity)?.receiverFacts?.finalCarrierSelection === true;
}

export function csharpJsSourceLibraryPropertyDeferredResultType(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): TargetTypeRef | undefined {
  return propertyRowForSelectedIdentity(selectedIdentity)?.deferredResultType;
}

export function csharpJsSourceLibraryPropertyDeferredOperation(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): { readonly operationId: string; readonly targetOperation: string } | undefined {
  const row = propertyRowForSelectedIdentity(selectedIdentity);
  if (row?.deferredResultType === undefined) {
    return undefined;
  }
  const members = propertyDeclaredMembersFromRow(row, selectedIdentity);
  const operationIds = uniqueValues(members.map((member) => member.id));
  const targetOperations = uniqueValues(members.map((member) => member.sourceName));
  return operationIds.length === 1 && targetOperations.length === 1
    ? { operationId: operationIds[0]!, targetOperation: targetOperations[0]! }
    : undefined;
}

export function csharpJsSourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: TargetTypeRef | undefined,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  host: CsharpJsSurfaceHost,
): boolean {
  return propertyReceiverRequirementIsSatisfied(
    propertyRowForSelectedIdentity(selectedIdentity)?.receiverFacts?.requirement,
    receiverType,
    host,
  );
}

function propertyRowForSelectedIdentity(selectedIdentity: JsSurfaceSelectedSourceIdentity): JsSurfacePropertyRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfacePropertyRows,
    selectedIdentity,
  );
}

function propertyPrecheckResult(
  precheck: JsSurfacePropertyPrecheck,
  request: Omit<JsSurfacePropertyTargetProviderRequest, "receiverType">,
): CsharpJsSourceLibraryPropertyPrecheck {
  if (typeof precheck === "string") {
    return precheck;
  }
  const members = targetMembersFromProvider(precheck.targetProvider, request);
  return members.length > 0 ? "defer" : "reject-unmapped";
}

function singlePropertyMember(members: readonly TargetMember[]): TargetMember | undefined {
  return members.length === 1 ? members[0] : undefined;
}

function propertyMembersFromRow(
  row: JsSurfacePropertyRow,
  request: JsSurfacePropertyTargetProviderRequest,
): readonly TargetMember[] {
  return (row.targetProviders ?? []).flatMap((provider) => targetMembersFromProvider(provider, request));
}

function propertyDeclaredMembersFromRow(
  row: JsSurfacePropertyRow,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return (row.targetProviders ?? []).flatMap((provider) => targetMembersDeclaredByProvider(provider, selectedIdentity));
}

function targetMembersFromProvider(
  provider: JsSurfacePropertyTargetProvider,
  request: JsSurfacePropertyTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "collection-metadata":
      return collectionTargetMembersForSelectedIdentity(request.selectedIdentity, request.receiverType, undefined);
    case "receiver-member":
      return targetMembersFromReceiverMetadata(provider.members, request.receiverType);
  }
}

function targetMembersDeclaredByProvider(
  provider: JsSurfacePropertyTargetProvider,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, selectedIdentity);
    case "collection-metadata":
      return [];
    case "receiver-member":
      return provider.members.map((member) => member.member);
  }
}

function targetMembersFromReceiverMetadata(
  members: readonly JsSurfaceReceiverPropertyMember[],
  receiverType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  const match = members.find((member) => receiverPropertySelectorMatches(member.receiver, receiverType));
  if (match === undefined) {
    return [];
  }
  return [{
    ...match.member,
    ...(match.useReceiverAsDeclaringType === true && receiverType !== undefined ? { declaringType: receiverType } : {}),
  }];
}

function receiverPropertySelectorMatches(
  selector: JsSurfaceReceiverPropertySelector,
  receiverType: TargetTypeRef | undefined,
): boolean {
  switch (selector.kind) {
    case "target-array":
      return receiverType?.kind === "array";
    case "target-id":
      return targetTypeIdMatches(receiverType, selector.id);
    case "target-feature":
      return propertyReceiverRequirementIsSatisfied(selector, receiverType, undefined);
  }
}

function propertyReceiverRequirementIsSatisfied(
  requirement: JsSurfacePropertyReceiverRequirement | undefined,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost | undefined,
): boolean {
  switch (requirement?.kind) {
    case "always":
      return true;
    case "array-like":
      return getCsharpArrayLikeElementType(receiverType) !== undefined;
    case "host":
      return hostReceiverPredicateIsSatisfied(requirement.predicate, receiverType, host);
    case "target-type-id":
      return targetTypeIdMatches(receiverType, requirement.id);
    case "target-feature":
      return requirement.feature === "read-only-indexable" &&
        isCsharpReadOnlyIndexableCollectionTargetType(receiverType);
    case undefined:
      return false;
  }
}

function hostReceiverPredicateIsSatisfied(
  predicate: JsSurfacePropertyHostReceiverPredicate,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost | undefined,
): boolean {
  switch (predicate) {
    case "isCsharpStringType":
      return host?.isCsharpStringType(receiverType) === true;
    case "isCsharpBooleanTargetType":
      return isCsharpBooleanTargetType(receiverType);
  }
}

function targetTypeIdMatches(receiverType: TargetTypeRef | undefined, id: string): boolean {
  return receiverType?.kind === "target-named" && receiverType.id === id;
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}
