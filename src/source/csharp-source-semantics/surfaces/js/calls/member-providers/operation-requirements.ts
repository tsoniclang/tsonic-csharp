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
  getCsharpCheckedCallRequestContext,
} from "../../../../checked-call-request-context.js";
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
  JsSurfaceTargetFeature,
} from "./operation-types.js";

export type JsSurfaceClosedFactsStatus =
  | { readonly kind: "satisfied" }
  | {
    readonly kind: "missing";
    readonly reason: "receiver" | "argument";
    readonly argumentIndex?: number;
  }
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
      return hasMissing ? { kind: "missing", reason: "receiver" } : { kind: "satisfied" };
    }
    case "receiver": {
      const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
      if (receiverTypes.length === 0) {
        return { kind: "missing", reason: "receiver" };
      }
      return receiverTypes.some((receiverType) => receiverMatchesTargetCondition(receiverType, requirement.target, selectedIdentity, request, context, host))
        ? { kind: "satisfied" }
        : { kind: "conflict" };
    }
    case "arguments":
      return argumentConditionsStatus(requirement.conditions, request, context, host);
    case "known-argument-targets": {
      const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
      const missingIndex = argumentTypes.findIndex((argumentType) => argumentType === undefined);
      return missingIndex < 0
        ? { kind: "satisfied" }
        : { kind: "missing", reason: "argument", argumentIndex: missingIndex };
    }
  }
}

function argumentConditionsStatus(
  conditions: readonly JsSurfaceArgumentCondition[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): JsSurfaceClosedFactsStatus {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  let missingArgumentIndex: number | undefined;
  for (const condition of conditions) {
    if ("index" in condition) {
      const argumentType = argumentTypes[condition.index];
      if (argumentType === undefined) {
        missingArgumentIndex ??= condition.index;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
      continue;
    }
    let currentIndex = condition.fromIndex;
    for (const argumentType of argumentTypes.slice(condition.fromIndex)) {
      if (argumentType === undefined) {
        missingArgumentIndex ??= currentIndex;
        currentIndex += 1;
        continue;
      }
      if (!argumentMatchesTargetCondition(argumentType, condition.target, host)) {
        return { kind: "conflict" };
      }
      currentIndex += 1;
    }
  }
  return missingArgumentIndex === undefined
    ? { kind: "satisfied" }
    : { kind: "missing", reason: "argument", argumentIndex: missingArgumentIndex };
}

function receiverMatchesTargetCondition(
  receiverType: TargetTypeRef | undefined,
  condition: JsSurfaceReceiverTargetCondition,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  return targetFeaturePredicates[condition.feature].receiver?.({
    receiverType,
    selectedIdentity,
    request,
    context,
    host,
  }) === true;
}

function argumentMatchesTargetCondition(
  argumentType: TargetTypeRef | undefined,
  condition: JsSurfaceArgumentTargetCondition,
  host: CsharpJsSurfaceHost,
): boolean {
  return targetFeaturePredicates[condition.feature].argument?.({
    argumentType,
    host,
  }) === true;
}

interface ReceiverFeaturePredicateRequest {
  readonly receiverType: TargetTypeRef | undefined;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly request: CheckedCallMappingRequest;
  readonly context: ExtensionObservationContext<"operation.mapCheckedCall">;
  readonly host: CsharpJsSurfaceHost;
}

interface ArgumentFeaturePredicateRequest {
  readonly argumentType: TargetTypeRef | undefined;
  readonly host: CsharpJsSurfaceHost;
}

interface TargetFeaturePredicate {
  readonly receiver?: (request: ReceiverFeaturePredicateRequest) => boolean;
  readonly argument?: (request: ArgumentFeaturePredicateRequest) => boolean;
}

const targetFeaturePredicates: Record<JsSurfaceTargetFeature, TargetFeaturePredicate> = {
  "array-like": {
    receiver: ({ receiverType }) => getCsharpArrayLikeElementType(receiverType) !== undefined,
  },
  string: {
    receiver: ({ receiverType, host }) => host.isCsharpStringType(receiverType),
    argument: ({ argumentType, host }) => host.isCsharpStringType(argumentType),
  },
  number: {
    receiver: ({ receiverType }) => isCsharpNumberTargetType(receiverType),
  },
  boolean: {
    receiver: ({ receiverType }) => isCsharpBooleanTargetType(receiverType),
  },
  regexp: {
    receiver: ({ receiverType, request, context }) => {
      const requestContext = getCsharpCheckedCallRequestContext(request, context);
      return isCsharpJsRegExpRuntimeCarrier(receiverType) ||
        getCsharpJsRegExpRuntimeCarrierForSubject(requestContext.calleeReceiver, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(requestContext.calleeReceiverSymbol, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(requestContext.calleeReceiverResolvedSymbol, context) !== undefined;
    },
  },
  date: {
    receiver: ({ receiverType }) => isCsharpJsDateRuntimeCarrier(receiverType),
  },
  "js-object": {
    receiver: ({ receiverType }) => isCsharpJsObjectCarrierTargetType(receiverType),
    argument: ({ argumentType }) => isCsharpJsObjectCarrierTargetType(argumentType),
  },
  "selected-collection-carrier": {
    receiver: ({ receiverType, selectedIdentity }) => {
      const policy = collectionPolicyForSelectedSourceIdentity(selectedIdentity);
      return policy !== undefined && collectionPolicyForTargetType(receiverType) === policy;
    },
  },
  "json-value": {
    argument: ({ argumentType, host }) => isSupportedJsonValueTargetType(argumentType, host),
  },
  "object-helper": {
    argument: ({ argumentType, host }) => isSupportedObjectHelperSourceTargetType(argumentType, host),
  },
};
