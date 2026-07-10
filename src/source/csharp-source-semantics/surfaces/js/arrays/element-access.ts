import {
  acceptObservation,
  rejectObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpJsSurfaceHost } from "../source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../source-library.js";
import {
  csharpTargetOperationFactKey,
} from "../../../../csharp-facts.js";
import {
  getCsharpArrayLikeElementType,
} from "../array-carriers.js";
export function mapCsharpJsArrayElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverCarrier: TargetTypeRef | undefined,
  semanticReceiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const elementType = getCsharpArrayLikeElementType(receiverCarrier ?? semanticReceiverType);
  if (elementType === undefined) {
    return undefined;
  }
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    if (
      existingOperation.operationKind === "indexer" &&
      receiverCarrier !== undefined &&
      context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) === undefined &&
      context.facts.get(request.expression, csharpTargetOperationFactKey) === undefined
    ) {
      recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(existingOperation.operationId, "indexer", "Item", {
        resultType: elementType,
      }), [{ message: "C# JS surface array indexer C# operation recorded from finalized receiver carrier for an existing checked target operation." }]);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# JS surface array indexer reused existing finalized target operation for repeated checked-element observation." }]);
  }
  const existingCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) ??
    context.facts.get(request.expression, csharpTargetOperationFactKey);
  if (existingCsharpOperation?.kind === "member" && existingCsharpOperation.operationKind === "indexer") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(existingCsharpOperation.operationId, "indexer", "System.Array.Item", {
        ...(existingCsharpOperation.resultType !== undefined ? { resultType: existingCsharpOperation.resultType } : {}),
      }),
    }, [{ message: "C# JS surface array indexer reused existing finalized C# target indexer operation after proving no canonical target operation already exists." }]);
  }
  const literalIndex = host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context);
  const indexType = literalIndex
    ? undefined
    : host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!literalIndex && !host.isIntegralTargetTypeRef(indexType)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array element access requires an integral provider-backed index type."));
  }
  if (receiverCarrier !== undefined) {
    recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.array.indexer", "indexer", "Item", {
      resultType: elementType,
    }), [{ message: "C# JS surface array indexer operation recorded from finalized array receiver carrier facts." }]);
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item", {
      resultType: elementType,
    }),
  }, [{ message: receiverCarrier === undefined
    ? "C# JS surface array indexer selected from checked TypeScript array semantics; C# operation finalization still requires receiver carrier facts."
    : "C# JS surface array indexer selected from finalized array receiver carrier facts." }]);
}
