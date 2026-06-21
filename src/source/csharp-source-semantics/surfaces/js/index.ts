import {
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedIterationMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";
import {
  mapCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  mapCsharpSourceLibraryCheckedCall,
} from "./calls.js";
import {
  mapCsharpSourceLibraryCheckedElementAccess,
} from "./elements.js";
import {
  mapCsharpJsSurfaceCheckedIteration,
} from "./iteration.js";
import {
  mapCsharpDirectSourceLibraryCheckedPropertyAccess,
  mapCsharpReceiverSourceLibraryCheckedPropertyAccess,
} from "./properties.js";

export interface CsharpJsSurfaceMappers {
  readonly mapRuntimeCarrier: (
    request: RuntimeCarrierFactRequest,
    context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  ) => ExtensionObservation<RuntimeCarrierFactResult>;
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedElementAccess: (
    request: CheckedElementAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedIteration: (
    request: CheckedIterationMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpJsSurfaceMappers(host: CsharpJsSurfaceHost): CsharpJsSurfaceMappers {
  return {
    mapRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsRegExpRuntimeCarrier(request, context);
    },
    mapCheckedCall(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpSourceLibraryCheckedCall(request, context, host) ?? deferObservation;
    },
    mapCheckedPropertyAccess(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpDirectSourceLibraryCheckedPropertyAccess(request, context, host) ??
        mapCsharpReceiverSourceLibraryCheckedPropertyAccess(request, context, host) ??
        deferObservation;
    },
    mapCheckedElementAccess(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpSourceLibraryCheckedElementAccess(request, context, host) ?? deferObservation;
    },
    mapCheckedIteration(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsSurfaceCheckedIteration(request, context, host);
    },
  };
}
