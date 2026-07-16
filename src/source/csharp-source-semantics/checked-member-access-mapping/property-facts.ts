import {
  acceptObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpSelectedPropertyTargetFactKey,
  resolveCsharpObjectShapeMemberBySelectedSubject,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  sourceOwnedPropertyOperation,
  targetOperation,
} from "../operations.js";
import {
  getSourceReceiverTargetType,
  selectedDeclarationIsAmbientOrExternal,
  targetTypeRefIsSourceDeclaredReceiver,
} from "./lifecycle-helpers.js";
import type {
  CheckedPropertyAccessContext,
} from "./types.js";

export function mapCsharpObjectShapeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const objectShape = host.getCsharpObjectShapeFactForSubject(request.receiver, context);
  if (objectShape === undefined) {
    return undefined;
  }
  const memberLookup = resolveCsharpObjectShapeMemberBySelectedSubject(objectShape, [
    request.sourceSelectedDeclaration,
    request.sourceSelectedSymbol,
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
      { resultType: member.type },
    ),
  }, [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
}

export function mapCsharpProjectSourceCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = asNodeSubject(requestContext.sourceSelectedDeclaration);
  const compiler = context.compiler;
  if (selectedDeclaration === undefined || compiler === undefined) {
    return undefined;
  }
  if (selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)) {
    return undefined;
  }
  const operation = sourceOwnedPropertyOperation(request.propertyName);
  if (selectedPropertyBelongsToStructuralSourceType(asNodeSubject(requestContext.sourceSelectedDeclarationContainer), context)) {
    context.facts.set(request.expression, csharpSelectedPropertyTargetFactKey, {
      selection: {
        kind: "structural-compat-property",
        propertyName: request.propertyName,
        sourceSelectedDeclaration: selectedDeclaration,
        ...(request.sourceResultType === undefined ? {} : { sourceResultType: request.sourceResultType }),
      },
    }, [{ message: "C# retained the exact TSTS-selected structural property until finalized receiver-carrier selection." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation,
    }, [{ message: "C# structural source property was accepted from exact TSTS-selected declaration evidence; target dispatch is finalized from the receiver carrier." }]);
  }
  recordCsharpSourceOwnedPropertyOperation(request, context, operation.operationId);
  return acceptObservation<CheckedOperationMappingResult>({
    operation,
  }, [{ message: "C# source-owned property access accepted from TSTS-selected project source declaration; backend renders source syntax without provider target-member facts." }]);
}

function selectedPropertyBelongsToStructuralSourceType(
  declarationContainer: ReturnType<typeof asNodeSubject> | undefined,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (declarationContainer === undefined || ast === undefined) {
    return false;
  }
  const kind = ast.kindName(declarationContainer);
  return kind === "KindTypeLiteral" || kind === "KindInterfaceDeclaration";
}

export function mapCsharpSourceDeclaredReceiverCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  if (selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)) {
    return undefined;
  }
  const receiverType = getSourceReceiverTargetType(undefined, request.receiver, context, host);
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
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const sourceDeclaringType = asNodeSubject(requestContext.sourceSelectedDeclarationContainer);
  const sourceDeclaringTypeSubject = !sourceDeclarationIsGenericNominalType(sourceDeclaringType, context)
    ? sourceDeclaringType
    : undefined;
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, "property", request.propertyName, {
    ...(sourceDeclaringTypeSubject === undefined ? {} : { sourceDeclaringType: sourceDeclaringTypeSubject }),
  }), [{ message: "C# source-owned property operation recorded from TSTS-selected source declaration identity; backend resolves target type facts after semantic finalization." }]);
}

function sourceDeclarationIsGenericNominalType(
  declaration: ReturnType<typeof asNodeSubject>,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (declaration === undefined || ast === undefined) {
    return false;
  }
  const kind = ast.kindName(declaration);
  return (kind === "KindClassDeclaration" || kind === "KindInterfaceDeclaration") &&
    ast.typeParameters(declaration).length > 0;
}
