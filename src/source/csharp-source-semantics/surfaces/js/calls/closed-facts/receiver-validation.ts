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
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceSourceIdentityMatchesSelector,
} from "../../target-member-metadata.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "../helpers.js";
import {
  collectionPolicyForSelectedSourceIdentity,
  collectionPolicyForTargetType,
} from "../../collection-target-metadata/definitions.js";
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
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly requirement: ClosedFactsRequirement;
}

type ClosedFactsRequirement =
  | { readonly kind: "all"; readonly requirements: readonly ClosedFactsRequirement[]; readonly except?: JsSurfaceSourceIdentitySelector }
  | { readonly kind: "receiver"; readonly target: ReceiverTargetCondition; readonly except?: JsSurfaceSourceIdentitySelector; readonly selectedDeclarationSatisfies?: boolean }
  | { readonly kind: "arguments"; readonly conditions: readonly ArgumentCondition[] }
  | { readonly kind: "known-argument-targets" };

type ReceiverTargetCondition =
  | "array-like"
  | "string"
  | "number"
  | "boolean"
  | "regexp"
  | "date"
  | "js-object"
  | "selected-collection-carrier";

type ArgumentCondition =
  | { readonly index: number; readonly target: ArgumentTargetCondition }
  | { readonly fromIndex: number; readonly target: ArgumentTargetCondition };

type ArgumentTargetCondition =
  | "string"
  | "json-value"
  | "object-helper"
  | "js-object";

const numberStaticCallWithoutReceiverPolicy = {
  ids: [
    "Number.parseInt",
    "Number.parseFloat",
    "Number.isNaN",
    "Number.isFinite",
    "Number.isInteger",
    "Number.isSafeInteger",
  ],
} satisfies JsSurfaceSourceIdentitySelector;

const closedFactRequirementRows: readonly ClosedFactsRule[] = [
  { identity: arrayConcatSourceMemberPolicy, requirement: { kind: "all", requirements: [
    { kind: "receiver", target: "array-like" },
    { kind: "known-argument-targets" },
  ] } },
  { identity: { prefixes: ["Array."] }, requirement: { kind: "receiver", target: "array-like", except: arrayStaticCallWithoutReceiverPolicy } },
  { identity: { prefixes: ["ReadonlyArray."] }, requirement: { kind: "receiver", target: "array-like" } },
  { identity: { prefixes: ["String."] }, requirement: { kind: "receiver", target: "string", except: stringStaticCallWithoutReceiverPolicy } },
  { identity: { prefixes: ["Number."] }, requirement: { kind: "receiver", target: "number", except: numberStaticCallWithoutReceiverPolicy } },
  { identity: { prefixes: ["Boolean."] }, requirement: { kind: "receiver", target: "boolean" } },
  { identity: { prefixes: ["RegExp."] }, requirement: { kind: "receiver", target: "regexp", except: regexpConstructorPolicy } },
  { identity: { prefixes: ["Date."] }, requirement: { kind: "receiver", target: "date", except: dateStaticCallWithoutReceiverPolicy, selectedDeclarationSatisfies: true } },
  { identity: objectHasOwnPropertyPolicy, requirement: { kind: "receiver", target: "js-object" } },
  { identity: { ids: ["JSON.parse"] }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "string" },
  ] } },
  { identity: { ids: ["JSON.stringify"] }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "json-value" },
  ] } },
  { identity: { ids: ["Object.keys", "Object.values", "Object.entries"] }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "object-helper" },
  ] } },
  { identity: { ids: ["Object.hasOwn"] }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "object-helper" },
    { index: 1, target: "string" },
  ] } },
  { identity: { ids: ["Object.assign"] }, requirement: { kind: "arguments", conditions: [
    { index: 0, target: "js-object" },
    { fromIndex: 1, target: "object-helper" },
  ] } },
  { identity: { prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] }, requirement: { kind: "receiver", target: "selected-collection-carrier", except: collectionConstructorIdentityPolicy } },
];

export function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const rule = jsSurfaceSelectMetadataRowForSourceIdentity(closedFactRequirementRows, selectedIdentity);
  return rule === undefined || closedFactsRequirementIsSatisfied(rule.requirement, request, context, selectedIdentity, host);
}

function closedFactsRequirementIsSatisfied(
  requirement: ClosedFactsRequirement,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  selectedIdentity: ReturnType<typeof jsSurfaceSelectedSourceIdentityForMember>,
  host: CsharpJsSurfaceHost,
): boolean {
  const except = closedFactsRequirementExcept(requirement);
  if (except !== undefined && jsSurfaceSourceIdentityMatchesSelector(selectedIdentity, except)) {
    return true;
  }
  switch (requirement.kind) {
    case "all":
      return requirement.requirements.every((innerRequirement) =>
        closedFactsRequirementIsSatisfied(innerRequirement, request, context, selectedIdentity, host)
      );
    case "receiver":
      return requirement.selectedDeclarationSatisfies === true && request.sourceSelectedDeclaration !== undefined
        ? true
        : getSourceLibraryCallReceiverTargetTypes(request, context, host)
          .some((receiverType) => receiverMatchesTargetCondition(receiverType, requirement.target, request, context, selectedIdentity, host));
    case "arguments":
      return argumentConditionsAreSatisfied(requirement.conditions, request, context, host);
    case "known-argument-targets":
      return getSourceLibraryCallArgumentTargetTypes(request, context, host).every((argumentType) => argumentType !== undefined);
  }
}

function argumentConditionsAreSatisfied(
  conditions: readonly ArgumentCondition[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return conditions.every((condition) => {
    if ("index" in condition) {
      return argumentMatchesTargetCondition(argumentTypes[condition.index], condition.target, host);
    }
    return argumentTypes
      .slice(condition.fromIndex)
      .every((argumentType) => argumentMatchesTargetCondition(argumentType, condition.target, host));
  });
}

function receiverMatchesTargetCondition(
  receiverType: TargetTypeRef | undefined,
  condition: ReceiverTargetCondition,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  selectedIdentity: ReturnType<typeof jsSurfaceSelectedSourceIdentityForMember>,
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
    case "selected-collection-carrier": {
      const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
      return policy !== undefined && collectionPolicyForTargetType(receiverType) === policy;
    }
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

function closedFactsRequirementExcept(requirement: ClosedFactsRequirement): JsSurfaceSourceIdentitySelector | undefined {
  switch (requirement.kind) {
    case "all":
    case "receiver":
      return requirement.except;
    case "arguments":
    case "known-argument-targets":
      return undefined;
  }
}
