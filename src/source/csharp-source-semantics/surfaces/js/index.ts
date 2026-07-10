import {
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  CheckedIterationMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";
import {
  mapCsharpJsRegExpRuntimeCarrier,
} from "./regexp/index.js";
import {
  mapCsharpJsDateRuntimeCarrier,
} from "./date/index.js";
import {
  mapCsharpJsJsonRuntimeCarrier,
} from "./json.js";
import {
  mapCsharpJsCollectionRuntimeCarrier,
} from "./collections.js";
import {
  mapCsharpJsArrayRuntimeCarrier,
} from "./array-carriers.js";
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
} from "./properties.js";
import {
  mapCsharpJsArrayMutationOperator,
} from "./array-mutations.js";

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
  readonly mapCheckedOperator: (
    request: CheckedOperatorMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedOperator">,
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
      const regExpCarrier = mapCsharpJsRegExpRuntimeCarrier(request, context);
      if (regExpCarrier.kind !== "defer") {
        return regExpCarrier;
      }
      const dateCarrier = mapCsharpJsDateRuntimeCarrier(request, context);
      if (dateCarrier.kind !== "defer") {
        return dateCarrier;
      }
      const arrayCarrier = mapCsharpJsArrayRuntimeCarrier(request, context, host);
      if (arrayCarrier.kind !== "defer") {
        return arrayCarrier;
      }
      const jsonCarrier = mapCsharpJsJsonRuntimeCarrier(request, context, host);
      return jsonCarrier.kind === "defer"
        ? mapCsharpJsCollectionRuntimeCarrier(request, context, host)
        : jsonCarrier;
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
      return mapCsharpDirectSourceLibraryCheckedPropertyAccess(request, context, host) ?? deferObservation;
    },
    mapCheckedElementAccess(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpSourceLibraryCheckedElementAccess(request, context, host) ?? deferObservation;
    },
    mapCheckedOperator(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsArrayMutationOperator(request, context, host) ?? deferObservation;
    },
    mapCheckedIteration(request, context) {
      if (request.target !== undefined && request.target !== host.targetId) {
        return deferObservation;
      }
      return mapCsharpJsSurfaceCheckedIteration(request, context, host);
    },
  };
}
