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
  collectionPolicyForSelectedSourceIdentity,
  collectionPolicyForTargetType,
} from "../../collection-target-metadata/definitions.js";
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
} from "../../source-library.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "../helpers.js";
import {
  isSupportedJsonValueTargetType,
  isSupportedObjectHelperSourceTargetType,
} from "../closed-facts/target-type-support.js";
import type {
  JsSurfaceArgumentCondition,
  JsSurfaceArgumentTargetCondition,
  JsSurfaceClosedFactsRequirement,
  JsSurfaceOperationRow,
  JsSurfaceReceiverTargetCondition,
} from "./operation-types.js";

export type JsSurfaceClosedFactsStatus =
  | { readonly kind: "satisfied" }
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" };

export function operationRowClosedFactsStatus(
  row: JsSurfaceOperationRow,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  return row.closedFacts === undefined
    ? { kind: "satisfied" }
    : closedFactsRequirementStatus(row.closedFacts, selectedIdentity, request, context, host);
}

function closedFactsRequirementStatus(
  requirement: JsSurfaceClosedFactsRequirement,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  switch (requirement.kind) {
    case "all": {
      let hasMissing = false;
      for (const innerRequirement of requirement.requirements) {
        const status = closedFactsRequirementStatus(innerRequirement, selectedIdentity, request, context, host);
        if (status.kind === "conflict") {
          return status;
        }
        if (status.kind === "missing") {
          hasMissing = true;
        }
      }
      return hasMissing ? { kind: "missing" } : { kind: "satisfied" };
    }
    case "receiver": {
      const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
      if (receiverTypes.length === 0) {
        return { kind: "missing" };
      }
      return receiverTypes.some((receiverType) => receiverMatchesTargetCondition(receiverType, requirement.target, selectedIdentity, request, context, host))
        ? { kind: "satisfied" }
        : { kind: "conflict" };
    }
    case "arguments":
      return argumentConditionsStatus(requirement.conditions, request, context, host);
    case "known-argument-targets":
      return getSourceLibraryCallArgumentTargetTypes(request, context, host).every((argumentType) => argumentType !== undefined)
        ? { kind: "satisfied" }
        : { kind: "missing" };
  }
}

function argumentConditionsStatus(
  conditions: readonly JsSurfaceArgumentCondition[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  let hasMissing = false;
  for (const condition of conditions) {
    if ("index" in condition) {
      const argumentType = argumentTypes[condition.index];
      if (argumentType === undefined) {
        hasMissing = true;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
      continue;
    }
    for (const argumentType of argumentTypes.slice(condition.fromIndex)) {
      if (argumentType === undefined) {
        hasMissing = true;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
    }
  }
  return hasMissing ? { kind: "missing" } : { kind: "satisfied" };
}

function receiverMatchesTargetCondition(
  receiverType: TargetTypeRef | undefined,
  condition: JsSurfaceReceiverTargetCondition,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
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
    case "selected-collection-carrier": {
      const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
      return policy !== undefined && collectionPolicyForTargetType(receiverType) === policy;
    }
  }
}

function argumentMatchesTargetCondition(
  argumentType: TargetTypeRef | undefined,
  condition: JsSurfaceArgumentTargetCondition,
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
