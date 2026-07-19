import {
  acceptObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetMemberOperation,
  recordCsharpTargetMutationOperation,
  targetOperation,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "./array-carriers.js";

export const csharpJsArrayDeleteAtOperationId = "tsonic.csharp.js.array.deleteAt";
export const csharpJsArraySetLengthOperationId = "tsonic.csharp.js.array.setLength";
export const csharpJsArrayLengthPropertyOperationIds = new Set([
  "tsonic.csharp.js.Array.length",
  "tsonic.csharp.js.ReadonlyArray.length",
]);

const csharpJsArrayElementOperationId = "tsonic.csharp.js.array.indexer";

export function mapCsharpJsArrayMutationOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.target !== undefined && request.target !== host.targetId) {
    return undefined;
  }
  if (request.operator === "=") {
    return mapSelectedArrayLengthAssignment(request, context, host);
  }
  if (request.operator === "delete") {
    return mapSelectedArrayElementDelete(request, context);
  }
  return undefined;
}

function mapSelectedArrayLengthAssignment(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.operatorKind !== "binary") {
    return undefined;
  }
  const selectedProperty = context.factResolver.resolve(request.left, targetOperationFactKey);
  const selectedCsharpProperty = context.factResolver.resolve(request.left, csharpTargetOperationFactKey);
  if (
    selectedProperty?.operationKind !== "property" ||
    !csharpJsArrayLengthPropertyOperationIds.has(selectedProperty.operationId)
  ) {
    return undefined;
  }
  const receiverCarrier = selectedCsharpProperty?.kind === "member"
    ? selectedCsharpProperty.declaringType
    : undefined;
  const assignedType = host.getTargetTypeRefForSubject(request.sourceRight.authoredTypeNode, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
  }) ?? host.getTargetTypeRefForSubject(request.sourceRight.type, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
  });
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier) || !host.isIntegralTargetTypeRef(assignedType)) {
    return undefined;
  }
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const operation = csharpTargetMemberOperation(csharpJsArraySetLengthOperationId, "method", "setLength", {
    declaringType: receiverCarrier,
    resultType,
    argumentProjection: [{ kind: "source-argument", index: 0 }],
  });
  recordCsharpTargetMutationOperation(context, request.expression, operation, [{
    message: "C# JS array length mutation selected from the checked assignment request, selected Array.length operation fact, and finalized JSArray carrier.",
  }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(csharpJsArraySetLengthOperationId, "method", "setLength"),
    resultType,
  }, [{ message: "C# JS array length mutation mapped from selected operation evidence without lifecycle reconstruction." }]);
}

function mapSelectedArrayElementDelete(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.operatorKind !== "prefix-unary") {
    return undefined;
  }
  const selectedElement = context.factResolver.resolve(request.operand, targetOperationFactKey);
  const selectedCsharpElement = context.factResolver.resolve(request.operand, csharpTargetOperationFactKey);
  if (
    selectedElement?.operationId !== csharpJsArrayElementOperationId ||
    selectedElement.operationKind !== "indexer" ||
    selectedCsharpElement?.kind !== "member" ||
    selectedCsharpElement.operationKind !== "indexer"
  ) {
    return undefined;
  }
  const receiverCarrier = selectedCsharpElement.declaringType;
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier)) {
    return undefined;
  }
  const resultType = csharpSourcePrimitiveTargetType("bool");
  const operation = csharpTargetMemberOperation(csharpJsArrayDeleteAtOperationId, "method", "deleteAt", {
    declaringType: receiverCarrier,
    resultType,
    argumentProjection: [{ kind: "source-argument", index: 0 }],
  });
  recordCsharpTargetMutationOperation(context, request.expression, operation, [{
    message: "C# JS array delete mutation selected from the checked delete request, selected array-indexer operation fact, and finalized JSArray carrier.",
  }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(csharpJsArrayDeleteAtOperationId, "method", "deleteAt"),
    resultType,
  }, [{ message: "C# JS array delete mutation mapped from selected operation evidence without lifecycle reconstruction." }]);
}
