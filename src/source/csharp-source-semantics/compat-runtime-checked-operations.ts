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
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getPropertyAccessName,
} from "./ast-utils.js";
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
  getBinaryOperatorText,
} from "./operator-syntax.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
export function mapCsharpCompatRuntimeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (
    !requestTargetsCsharp(request.target) ||
    !hasOpaqueAnyCarrier(request.receiver, context)
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
  if (!requestTargetsCsharp(request.target) || !hasOpaqueAnyCarrier(request.receiver, context)) {
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
  if (!requestTargetsCsharp(request.target) || !hasOpaqueAnyCarrier(request.callee, context)) {
    return deferObservation;
  }
  const operation = callExpressionIsConstruct(request.call, context)
    ? compatAnyConstructOperation(request.arguments.length)
    : compatAnyCallOperation(request.arguments.length);
  recordCsharpTargetOperation(context, request.call, operation, csharpCompatRuntimeEvidence);
  recordTargetOperationFact(context, request.call, targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
    resultType: operation.resultType,
  }), csharpCompatRuntimeEvidence);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: {
      member: compatAnySelectedTargetMember(operation),
    },
    returnType: operation.resultType,
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
    const operation = getCompatRuntimeAssignmentOperation(request.expression, context);
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
  if (!hasOpaqueAnyCarrier(request.left, context) && !hasOpaqueAnyCarrier(request.right, context)) {
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
  expression: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
): ReturnType<typeof compatAnyPropertyWriteOperation> | ReturnType<typeof compatAnyElementWriteOperation> | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(expression);
  if (compiler === undefined || node === undefined || !compiler.ast.is.IsBinaryExpression(node) || getBinaryOperatorText(compiler.ast, node) !== "=") {
    return undefined;
  }
  const left = asNodeSubject(getNodeField(node, "Left"));
  if (left === undefined) {
    return undefined;
  }
  if (compiler.ast.is.IsPropertyAccessExpression(left)) {
    const receiver = asNodeSubject(getNodeField(left, "Expression"));
    const propertyName = getPropertyAccessName(left, compiler.ast);
    return propertyName !== undefined && hasOpaqueAnyCarrier(receiver, context)
      ? compatAnyPropertyWriteOperation(propertyName)
      : undefined;
  }
  if (compiler.ast.is.IsElementAccessExpression(left)) {
    const receiver = asNodeSubject(getNodeField(left, "Expression"));
    return hasOpaqueAnyCarrier(receiver, context)
      ? compatAnyElementWriteOperation()
      : undefined;
  }
  return undefined;
}

function callExpressionIsConstruct(
  call: ExtensionFactSubject,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const node = asNodeSubject(call);
  return node !== undefined && context.compiler?.ast.is.IsNewExpression(node) === true;
}

function hasOpaqueAnyCarrier(
  subject: ExtensionFactSubject | Node | undefined,
  context: Pick<ExtensionObservationContext, "factResolver" | "facts" | "compiler">,
): boolean {
  if (subject === undefined) {
    return false;
  }
  if (
    isCsharpAnyRuntimeCarrier(context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier) ||
    isCsharpAnyRuntimeCarrier(context.facts.get(subject, runtimeCarrierFactKey)?.carrier)
  ) {
    return true;
  }
  const node = asNodeSubject(subject);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  const type = compiler.checker.getTypeAtLocation(node, { sourceFile: compiler.ast.getSourceFile(node) });
  return type !== undefined && (
    compiler.typeShape.isAny(type) ||
    isCsharpAnyRuntimeCarrier(context.factResolver.resolve(type, runtimeCarrierFactKey)?.carrier)
  );
}

function requestTargetsCsharp(target: string | undefined): boolean {
  return target === undefined || target === csharpTargetId;
}
