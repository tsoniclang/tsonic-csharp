import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  acceptObservation,
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
  targetOperation,
} from "./source-library.js";
import {
  getSelectedSourceLibraryDeclarationName,
} from "../../source-library.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceContainer = getSelectedSourceLibraryDeclarationName(request.sourceSelectedDeclaration, request.sourceSelectedSymbol, context);
  if (sourceContainer === "Array" || sourceContainer === "ReadonlyArray") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    const mapped = mapCsharpJsArrayElementAccess(request, context, receiverCarrier, undefined, host);
    if (mapped !== undefined) {
      return mapped;
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item"),
    }, [{ message: "C# JS surface array indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later receiver carrier facts." }]);
  }
  if (sourceContainer === "String") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsStringElementAccess(request, context, receiverCarrier, host);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.string.codeUnit", "indexer", "String.Substring"),
    }, [{ message: "C# JS surface string indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later receiver carrier facts." }]);
  }
  if (sourceContainer === "Record") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsRecordDictionaryElementAccess(request, context, receiverCarrier, host);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.Record.indexer", "indexer", "Record.Dictionary.Item"),
    }, [{ message: "C# JS surface Record indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later Record dictionary carrier facts." }]);
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
