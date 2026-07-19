import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  mapCsharpJsArrayElementAccess,
} from "./arrays.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  mapCsharpJsStringElementAccess,
} from "./strings.js";
import {
  mapCsharpJsRecordDictionaryElementAccess,
} from "./dictionaries.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";
import {
  getSelectedSourceLibraryDeclarationName,
} from "../../source-library.js";
import {
  getSelectedAccessEvidence,
} from "../../selected-source-evidence.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const selectedEvidence = getSelectedAccessEvidence(request);
  const sourceContainer = getSelectedSourceLibraryDeclarationName(
    selectedEvidence.selectedDeclaration,
    selectedEvidence.selectedSymbol,
    context,
  );
  if (sourceContainer === "Array" || sourceContainer === "ReadonlyArray") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    const mapped = mapCsharpJsArrayElementAccess(request, context, receiverCarrier, undefined, host);
    if (mapped !== undefined) {
      return mapped;
    }
    return deferObservation;
  }
  if (sourceContainer === "String") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsStringElementAccess(request, context, receiverCarrier, host);
    }
    return deferObservation;
  }
  if (sourceContainer === "Record") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsRecordDictionaryElementAccess(request, context, receiverCarrier, host);
    }
    return deferObservation;
  }
  return undefined;
}

function getFinalizedReceiverCarrier(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    getCsharpArrayBoundaryCoreCarrierForReference(request.receiver, context) ??
      context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}
