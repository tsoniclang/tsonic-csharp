import {
  acceptObservation,
  deferObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpProjectSourceFactKey,
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "../../csharp-facts.js";
import {
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  sourceOwnedPropertyOperation,
  targetOperation,
} from "../operations.js";
import {
  getSourceReceiverTargetType,
  targetTypeRefIsSourceDeclaredReceiver,
} from "./lifecycle-helpers.js";
import {
  subjectIsSourceCoreStructDeclarationPayload,
} from "../source-core-struct-markers.js";
import type {
  CheckedPropertyAccessContext,
} from "./types.js";
import {
  getSelectedAccessEvidence,
} from "../selected-source-evidence.js";

export function mapCsharpObjectShapeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const objectShape = host.getCsharpObjectShapeFactForSubject(request.sourceReceiver.type, context) ??
    host.getCsharpObjectShapeFactForSubject(request.sourceReceiver.expression, context);
  if (objectShape === undefined) {
    return undefined;
  }
  const selectedEvidence = getSelectedAccessEvidence(request);
  const memberLookup = resolveCsharpObjectShapeMemberBySelectedSubject(objectShape, [
    selectedEvidence.selectedDeclaration,
    selectedEvidence.selectedSymbol,
  ]);
  if (memberLookup.kind !== "resolved") {
    return undefined;
  }
  const member = memberLookup.member;
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# object-shape property access reused finalized TSTS/source operation fact for the same checked expression." }]);
  }
  const operationId = `tsonic.csharp.objectShape.${request.propertyName}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, member.memberKind === "method" ? "method" : "property", member.targetName, {
    declaringType: objectShape.targetType,
    resultType: member.type,
  }), [{ message: "C# object-shape member operation recorded from finalized structural shape fact." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      operationId,
      member.memberKind === "method" ? "method" : "property",
      member.targetName,
    ),
    resultType: member.type,
  }, [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
}

export function mapCsharpProjectSourceCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const selectedDeclaration = getSelectedAccessEvidence(request).selectedDeclaration;
  if (
    selectedDeclaration === undefined ||
    (context.facts.get(selectedDeclaration, csharpProjectSourceFactKey) === undefined &&
      context.factResolver.resolve(selectedDeclaration, csharpProjectSourceFactKey) === undefined)
  ) {
    return context.phase === "checking" && selectedDeclaration !== undefined
      ? deferObservation
      : undefined;
  }
  const receiverType = getSourceReceiverTargetType(
    request.sourceReceiver,
    context,
    host,
  );
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  const operation = sourceOwnedPropertyOperation(request.propertyName);
  recordCsharpSourceOwnedPropertyOperation(request, context, operation.operationId);
  return acceptObservation<CheckedOperationMappingResult>({
    operation,
  }, [{ message: "C# source-owned property access accepted from TSTS-selected project source declaration; backend renders source syntax without provider target-member facts." }]);
}

export function mapCsharpSourceCoreStructCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  return [
    request.sourceReceiver.selectedDeclaration,
    request.sourceReceiver.declaration,
    request.sourceReceiver.type,
  ].some((subject) => subjectIsSourceCoreStructDeclarationPayload(subject, context))
    ? mapCsharpProjectSourceCheckedPropertyAccess(request, context, host)
    : undefined;
}

export function mapCsharpSourceDeclaredReceiverCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = getSourceReceiverTargetType(request.sourceReceiver, context, host);
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  const operation = sourceOwnedPropertyOperation(request.propertyName);
  recordCsharpSourceOwnedPropertyOperation(request, context, operation.operationId);
  return acceptObservation<CheckedOperationMappingResult>({
    operation,
  }, [{ message: "C# source-owned property access accepted from checked TSTS source declaration receiver facts." }]);
}

function recordCsharpSourceOwnedPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  operationId: string,
): void {
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "property", request.propertyName, {
    sourceDeclaringType: request.sourceReceiver.type,
  }), [{ message: "C# source-owned property operation recorded from TSTS-selected source declaration identity; backend resolves target type facts after semantic finalization." }]);
}
