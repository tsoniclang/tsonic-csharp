import {
  acceptObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
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
  asNodeSubject,
} from "../../ast-utils.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";
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
    return mapSelectedArrayElementDelete(request, context, host);
  }
  return undefined;
}

function mapSelectedArrayLengthAssignment(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const compiler = context.compiler;
  const left = asNodeSubject(request.left);
  const right = asNodeSubject(request.right);
  if (compiler === undefined || left === undefined || right === undefined || !compiler.ast.is.IsPropertyAccessExpression(left)) {
    return undefined;
  }
  const selectedProperty = context.factResolver.resolve(left, targetOperationFactKey);
  if (
    selectedProperty?.operationKind !== "property" ||
    !csharpJsArrayLengthPropertyOperationIds.has(selectedProperty.operationId)
  ) {
    return undefined;
  }
  const receiver = compiler.ast.as.AsPropertyAccessExpression(left)?.Expression;
  const receiverCarrier = getSelectedArrayReceiverCarrier(receiver, context, host);
  if (receiverCarrier === undefined || !hasIntegralTargetEvidence(right, context, host)) {
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
    operation: targetOperation(csharpJsArraySetLengthOperationId, "method", "setLength", { resultType }),
  }, [{ message: "C# JS array length mutation mapped from selected operation evidence without lifecycle reconstruction." }]);
}

function mapSelectedArrayElementDelete(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const compiler = context.compiler;
  const operand = asNodeSubject(request.left);
  if (compiler === undefined || operand === undefined || !compiler.ast.is.IsElementAccessExpression(operand)) {
    return undefined;
  }
  const selectedElement = context.factResolver.resolve(operand, targetOperationFactKey);
  const selectedCsharpElement = context.factResolver.resolve(operand, csharpTargetOperationFactKey);
  if (
    selectedElement?.operationId !== csharpJsArrayElementOperationId ||
    selectedElement.operationKind !== "indexer" ||
    selectedCsharpElement?.kind !== "member" ||
    selectedCsharpElement.operationKind !== "indexer"
  ) {
    return undefined;
  }
  const elementAccess = compiler.ast.as.AsElementAccessExpression(operand);
  const receiverCarrier = getSelectedArrayReceiverCarrier(elementAccess?.Expression, context, host);
  const argument = elementAccess?.ArgumentExpression;
  if (receiverCarrier === undefined || argument === undefined || !hasIntegralTargetEvidence(argument, context, host)) {
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
    operation: targetOperation(csharpJsArrayDeleteAtOperationId, "method", "deleteAt", { resultType }),
  }, [{ message: "C# JS array delete mutation mapped from selected operation evidence without lifecycle reconstruction." }]);
}

function getSelectedArrayReceiverCarrier(
  receiver: Node | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  if (receiver === undefined) {
    return undefined;
  }
  const carrier = getCsharpArrayBoundaryCoreCarrierForReference(receiver, context) ??
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    host.getTargetTypeRefForSubject(receiver, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: false,
    });
  return isCsharpJsArrayCarrierTargetType(carrier) ? carrier : undefined;
}

function hasIntegralTargetEvidence(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): boolean {
  const targetType = host.getTargetTypeRefForSubject(node, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
  });
  return host.isIntegralTargetTypeRef(targetType) ||
    host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), node, context);
}
