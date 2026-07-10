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
  getCsharpCheckedCallRequestContext,
} from "../../../../checked-call-request-context.js";
import {
  isSupportedJsonValueTargetType,
  isSupportedObjectHelperSourceTargetType,
} from "../closed-facts/target-type-support.js";
import type {
  JsSurfaceTargetFeature,
  JsSurfaceTargetFeatureCondition,
} from "./operation-types.js";

export interface ReceiverFeaturePredicateRequest {
  readonly receiverType: TargetTypeRef | undefined;
  readonly selectedIdentity?: JsSurfaceSelectedSourceIdentity;
  readonly request?: CheckedCallMappingRequest;
  readonly context?: ExtensionObservationContext<"operation.mapCheckedCall">;
  readonly host: CsharpJsSurfaceHost;
}

export interface ArgumentFeaturePredicateRequest {
  readonly argumentType: TargetTypeRef | undefined;
  readonly host: CsharpJsSurfaceHost;
}

interface TargetFeaturePredicate {
  readonly receiver?: (request: ReceiverFeaturePredicateRequest) => boolean;
  readonly argument?: (request: ArgumentFeaturePredicateRequest) => boolean;
}

export function jsSurfaceReceiverMatchesTargetFeature(
  condition: JsSurfaceTargetFeatureCondition,
  request: ReceiverFeaturePredicateRequest,
): boolean {
  return targetFeaturePredicates[condition.feature].receiver?.(request) === true;
}

export function jsSurfaceArgumentMatchesTargetFeature(
  condition: JsSurfaceTargetFeatureCondition,
  request: ArgumentFeaturePredicateRequest,
): boolean {
  return targetFeaturePredicates[condition.feature].argument?.(request) === true;
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
      if (request === undefined || context === undefined) {
        return isCsharpJsRegExpRuntimeCarrier(receiverType);
      }
      const requestContext = getCsharpCheckedCallRequestContext(request, context);
      return isCsharpJsRegExpRuntimeCarrier(receiverType) ||
        getCsharpJsRegExpRuntimeCarrierForSubject(requestContext.calleeReceiver, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(requestContext.calleeReceiverType, context) !== undefined;
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
      if (selectedIdentity === undefined) {
        return false;
      }
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
