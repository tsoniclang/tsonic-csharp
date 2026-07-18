import {
  acceptObservation,
  deferObservation,
  rejectObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  compatAnyCallOperation,
  compatAnyConstructOperation,
  compatAnyBinaryOperatorOperation,
  compatAnyElementReadOperation,
  compatAnyElementWriteOperation,
  compatAnyPropertyReadOperation,
  compatAnyPropertyWriteOperation,
  compatAnySelectedTargetMember,
  compatAnyUnaryOperatorOperation,
  csharpCompatRuntimeEvidence,
} from "./compat-runtime-operation-model.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  targetOperation,
  recordCsharpTargetOperation,
  recordTargetOperationFact,
} from "./operations.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getTargetArgumentConversionSlots,
} from "./target-member-arguments/argument-conversions.js";
export function mapCsharpCompatRuntimeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (
    !requestTargetsCsharp(request.target) ||
    !hasOpaqueAnyCarrier([request.sourceReceiver.expression, request.sourceReceiver.type], context)
  ) {
    return deferObservation;
  }
  const operation = compatAnyPropertyReadOperation(request.propertyName);
  recordCsharpTargetOperation(context, request.expression, operation, csharpCompatRuntimeEvidence);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
      resultType: operation.resultType,
    }),
  }, csharpCompatRuntimeEvidence);
}

export function mapCsharpCompatRuntimeCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (!requestTargetsCsharp(request.target) || !hasOpaqueAnyCarrier([request.sourceReceiver.expression, request.sourceReceiver.type], context)) {
    return deferObservation;
  }
  const operation = compatAnyElementReadOperation();
  recordCsharpTargetOperation(context, request.expression, operation, csharpCompatRuntimeEvidence);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
      resultType: operation.resultType,
    }),
  }, csharpCompatRuntimeEvidence);
}

export function mapCsharpCompatRuntimeCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  if (!requestTargetsCsharp(request.target) || !hasOpaqueAnyCarrier([request.sourceCallee.expression, request.sourceCallee.type], context)) {
    return deferObservation;
  }
  const operation = request.callKind === "construct"
    ? compatAnyConstructOperation(request.arguments.length)
    : compatAnyCallOperation(request.arguments.length);
  const member = compatAnySelectedTargetMember(operation);
  const argumentConversions = getTargetArgumentConversionSlots(member.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: request.sourceArgumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_COMPAT_ANY_ARGUMENT_BINDINGS_NOT_PROVEN",
      9100189,
      "C# compatibility call requires exact TSTS argument-slot evidence.",
      undefined,
      request.call,
    ));
  }
  recordCsharpTargetOperation(context, request.call, operation, csharpCompatRuntimeEvidence);
  recordTargetOperationFact(context, request.call, targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
    resultType: operation.resultType,
  }), csharpCompatRuntimeEvidence);
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: {
      member,
    },
    argumentConversions,
  }, csharpCompatRuntimeEvidence);
}

export function mapCsharpCompatRuntimeCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (!requestTargetsCsharp(request.target)) {
    return deferObservation;
  }
  if (request.operator === "=") {
    const operation = getCompatRuntimeAssignmentOperation(request.left, context);
    if (operation === undefined) {
      return deferObservation;
    }
    recordCsharpTargetOperation(context, request.expression, operation, csharpCompatRuntimeEvidence);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
        resultType: operation.resultType,
      }),
    }, csharpCompatRuntimeEvidence);
  }
  if (
    !hasOpaqueAnyCarrier(sourceEvidenceSubjects(request.sourceLeft), context) &&
    !hasOpaqueAnyCarrier(sourceEvidenceSubjects(request.sourceRight), context)
  ) {
    return deferObservation;
  }
  const operation = request.right === undefined
    ? compatAnyUnaryOperatorOperation(request.operator)
    : compatAnyBinaryOperatorOperation(request.operator);
  if (operation === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_COMPAT_ANY_OPERATOR_UNSUPPORTED",
      9100157,
      `C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator '${request.operator}'.`,
    ));
  }
  recordCsharpTargetOperation(context, request.expression, operation, csharpCompatRuntimeEvidence);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operation.operationId, "operator", request.operator, {
      resultType: operation.resultType,
    }),
  }, csharpCompatRuntimeEvidence);
}

function getCompatRuntimeAssignmentOperation(
  left: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
): ReturnType<typeof compatAnyPropertyWriteOperation> | ReturnType<typeof compatAnyElementWriteOperation> | undefined {
  const selected = context.facts.get(left, csharpTargetOperationFactKey) ??
    context.factResolver.resolve(left, csharpTargetOperationFactKey);
  if (selected?.kind !== "member") {
    return undefined;
  }
  if (selected.memberName === "ReadCompatElement") {
    return compatAnyElementWriteOperation();
  }
  const propertyName = selected.memberName === "ReadCompatSlot" &&
    selected.argumentProjection?.[0]?.kind === "literal" &&
    typeof selected.argumentProjection[0].value === "string"
    ? selected.argumentProjection[0].value
    : undefined;
  return propertyName === undefined ? undefined : compatAnyPropertyWriteOperation(propertyName);
}

function hasOpaqueAnyCarrier(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  context: Pick<ExtensionObservationContext, "factResolver" | "facts">,
): boolean {
  return subjects.some((subject) => subject !== undefined && (
    isCsharpAnyRuntimeCarrier(context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier) ||
    isCsharpAnyRuntimeCarrier(context.facts.get(subject, runtimeCarrierFactKey)?.carrier)
  ));
}

function sourceEvidenceSubjects(
  evidence: CheckedOperatorMappingRequest["sourceLeft"] | CheckedOperatorMappingRequest["sourceRight"],
): readonly (ExtensionFactSubject | undefined)[] {
  return evidence === undefined ? [] : [evidence.expression, evidence.type];
}

function requestTargetsCsharp(target: string | undefined): boolean {
  return target === undefined || target === csharpTargetId;
}
