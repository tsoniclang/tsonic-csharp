import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../../arrays.js";
import {
  isCsharpBooleanTargetType,
} from "../../booleans.js";
import {
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "../../collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "../../date/index.js";
import {
  isCsharpNumberTargetType,
} from "../../numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../../objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberMatches,
  sourceLibraryMemberIdSet,
} from "../../source-library.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "../helpers.js";
import {
  arrayConcatSourceMemberPolicy,
  arrayStaticCallWithoutReceiverPolicy,
  collectionConstructorIdentityPolicy,
  dateStaticCallWithoutReceiverPolicy,
  objectHasOwnPropertyPolicy,
  regexpConstructorPolicy,
  stringStaticCallWithoutReceiverPolicy,
} from "./identity-policies.js";
import {
  isSupportedJsonValueTargetType,
  isSupportedObjectHelperSourceTargetType,
} from "./target-type-support.js";

interface ClosedFactsRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly requirement: ClosedFactsRequirement;
}

type ClosedFactsRequirement =
  | { readonly kind: "receiver"; readonly target: ReceiverTargetCondition; readonly except?: SourceLibraryMemberIdentityPolicy; readonly selectedDeclarationSatisfies?: boolean }
  | { readonly kind: "arguments"; readonly conditions: readonly ArgumentCondition[] }
  | { readonly kind: "object-assign" }
  | { readonly kind: "array-receiver"; readonly concatRequiresKnownArguments?: boolean; readonly except?: SourceLibraryMemberIdentityPolicy }
  | { readonly kind: "collection-receiver"; readonly target: "map" | "set"; readonly except?: SourceLibraryMemberIdentityPolicy };

type ReceiverTargetCondition =
  | "array-like"
  | "string"
  | "number"
  | "boolean"
  | "regexp"
  | "date"
  | "js-object";

interface ArgumentCondition {
  readonly index: number;
  readonly target: ArgumentTargetCondition;
}

type ArgumentTargetCondition =
  | "string"
  | "json-value"
  | "object-helper"
  | "js-object";

const numberStaticCallWithoutReceiverPolicy = {
  ids: sourceIds(
    "Number.parseInt",
    "Number.parseFloat",
    "Number.isNaN",
    "Number.isFinite",
    "Number.isInteger",
    "Number.isSafeInteger",
  ),
} satisfies SourceLibraryMemberIdentityPolicy;

const closedFactRequirementRows: readonly ClosedFactsRule[] = [
  { identity: { prefixes: ["Array."] }, requirement: { kind: "array-receiver", except: arrayStaticCallWithoutReceiverPolicy, concatRequiresKnownArguments: true } },
  { identity: { prefixes: ["ReadonlyArray."] }, requirement: { kind: "receiver", target: "array-like" } },
  { identity: { prefixes: ["String."] }, requirement: { kind: "receiver", target: "string", except: stringStaticCallWithoutReceiverPolicy } },
  { identity: { prefixes: ["Number."] }, requirement: { kind: "receiver", target: "number", except: numberStaticCallWithoutReceiverPolicy } },
  { identity: { prefixes: ["Boolean."] }, requirement: { kind: "receiver", target: "boolean" } },
  { identity: { prefixes: ["RegExp."] }, requirement: { kind: "receiver", target: "regexp", except: regexpConstructorPolicy } },
  { identity: { prefixes: ["Date."] }, requirement: { kind: "receiver", target: "date", except: dateStaticCallWithoutReceiverPolicy, selectedDeclarationSatisfies: true } },
  { identity: objectHasOwnPropertyPolicy, requirement: { kind: "receiver", target: "js-object" } },
  { identity: { ids: sourceIds("JSON.parse") }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "string" },
  ] } },
  { identity: { ids: sourceIds("JSON.stringify") }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "json-value" },
  ] } },
  { identity: { ids: sourceIds("Object.keys", "Object.values", "Object.entries") }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "object-helper" },
  ] } },
  { identity: { ids: sourceIds("Object.hasOwn") }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "js-object" },
    { index: 1, target: "string" },
  ] } },
  { identity: { ids: sourceIds("Object.assign") }, requirement: { kind: "object-assign" } },
  { identity: { prefixes: ["Map.", "ReadonlyMap."] }, requirement: { kind: "collection-receiver", target: "map", except: collectionConstructorIdentityPolicy } },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, requirement: { kind: "collection-receiver", target: "set", except: collectionConstructorIdentityPolicy } },
];

export function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const rule = closedFactRequirementRows.find((candidate) => sourceLibraryMemberMatches(sourceMember, candidate.identity));
  return rule === undefined || closedFactsRequirementIsSatisfied(rule.requirement, request, context, sourceMember, host);
}

function closedFactsRequirementIsSatisfied(
  requirement: ClosedFactsRequirement,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const except = closedFactsRequirementExcept(requirement);
  if (except !== undefined && sourceLibraryMemberMatches(sourceMember, except)) {
    return true;
  }
  switch (requirement.kind) {
    case "receiver":
      return requirement.selectedDeclarationSatisfies === true && request.sourceSelectedDeclaration !== undefined
        ? true
        : getSourceLibraryCallReceiverTargetTypes(request, context, host)
          .some((receiverType) => receiverMatchesTargetCondition(receiverType, requirement.target, request, context, host));
    case "arguments":
      return argumentConditionsAreSatisfied(requirement.conditions, request, context, host);
    case "object-assign":
      return objectAssignFactsAreClosed(request, context, host);
    case "array-receiver":
      return arrayReceiverFactsAreClosed(requirement, request, context, host, sourceMember);
    case "collection-receiver":
      return getSourceLibraryCallReceiverTargetTypes(request, context, host)
        .some((receiverType) => requirement.target === "map" ? isCsharpJsMapTargetType(receiverType) : isCsharpJsSetTargetType(receiverType));
  }
}

function arrayReceiverFactsAreClosed(
  requirement: Extract<ClosedFactsRequirement, { readonly kind: "array-receiver" }>,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  sourceMember: SourceLibraryMember,
): boolean {
  if (requirement.concatRequiresKnownArguments === true &&
    sourceLibraryMemberMatches(sourceMember, arrayConcatSourceMemberPolicy) &&
    getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
    return false;
  }
  return getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
}

function argumentConditionsAreSatisfied(
  conditions: readonly ArgumentCondition[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return conditions.every((condition) => argumentMatchesTargetCondition(argumentTypes[condition.index], condition.target, host));
}

function objectAssignFactsAreClosed(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
    argumentTypes.slice(1).every((argumentType) => isSupportedObjectHelperSourceTargetType(argumentType, host));
}

function receiverMatchesTargetCondition(
  receiverType: TargetTypeRef | undefined,
  condition: ReceiverTargetCondition,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  switch (condition) {
    case "array-like":
      return getCsharpArrayLikeElementType(receiverType) !== undefined;
    case "string":
      return host.isCsharpStringType(receiverType);
    case "number":
      return isCsharpNumberTargetType(receiverType);
    case "boolean":
      return isCsharpBooleanTargetType(receiverType);
    case "regexp":
      return isCsharpJsRegExpRuntimeCarrier(receiverType) ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiver, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverSymbol, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverResolvedSymbol, context) !== undefined;
    case "date":
      return isCsharpJsDateRuntimeCarrier(receiverType);
    case "js-object":
      return isCsharpJsObjectCarrierTargetType(receiverType);
  }
}

function argumentMatchesTargetCondition(
  argumentType: TargetTypeRef | undefined,
  condition: ArgumentTargetCondition,
  host: CsharpJsSurfaceHost,
): boolean {
  switch (condition) {
    case "string":
      return host.isCsharpStringType(argumentType);
    case "json-value":
      return isSupportedJsonValueTargetType(argumentType, host);
    case "object-helper":
      return isSupportedObjectHelperSourceTargetType(argumentType, host);
    case "js-object":
      return isCsharpJsObjectCarrierTargetType(argumentType);
  }
}

function closedFactsRequirementExcept(requirement: ClosedFactsRequirement): SourceLibraryMemberIdentityPolicy | undefined {
  switch (requirement.kind) {
    case "receiver":
    case "array-receiver":
    case "collection-receiver":
      return requirement.except;
    case "arguments":
    case "object-assign":
      return undefined;
  }
}

function sourceIds(...ids: Parameters<typeof sourceLibraryMemberIdSet>[0]): ReturnType<typeof sourceLibraryMemberIdSet> {
  return sourceLibraryMemberIdSet(ids);
}
