import {
  acceptObservation,
  deferObservation,
  rejectObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "../identity.js";
import {
  getRecordedCsharpRuntimeCarrierFact,
  recordCsharpRuntimeCarrierFact,
  csharpTargetOperationFactKey,
  CsharpTargetOperatorOperation,
} from "../../csharp-facts.js";
import {
  csharpTargetIntrinsicOperatorOperation,
  csharpTargetTokenOperatorOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../operations.js";
import {
  csharpSourcePrimitiveTargetType,
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";
import {
  getCsharpOperatorTargetOperation,
  isCsharpIncrementDecrementTargetTypeRef,
  isCsharpIncrementOrDecrementOperator,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isSourceEnumTargetTypeRef,
} from "../target-rules.js";
import {
  getTypeofComparisonOperation,
} from "../typeof-operators.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  mapCsharpCompatRuntimeCheckedOperator,
} from "../compat-runtime-checked-operations.js";
import {
  isClosedCompatRuntimeOperationFact,
} from "../opaque-any-diagnostics/closed-compat.js";
import {
  csharpOpaqueAnyOperationDiagnostic,
} from "../opaque-any-diagnostics/diagnostic.js";
import {
  getCheckedOperatorOpaqueAnyOperation,
} from "../opaque-any-diagnostics/selected-evidence.js";
import {
  getCheckedOperatorOperandTargetTypeRefs,
} from "./operands.js";
import {
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  operatorRequiresSelectedProviderIdentity,
} from "./operator-rules.js";
import {
  mapCsharpTypeofOperator,
} from "./typeof.js";

export {
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  getLiteralTargetTypeRefForKnownOperatorOperand,
  getNullishTargetTypeRefForKnownOperatorOperand,
  operatorRequiresSelectedProviderIdentity,
} from "./operator-rules.js";

export function mapCsharpCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
  typescriptCompatibilityMode: TargetTypescriptCompatibilityMode = "strict-native",
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const existingCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey);
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
      ...(existingOperation.resultType === undefined ? {} : { resultType: existingOperation.resultType }),
    }, [{ message: "C# source operator reused existing finalized target operation for repeated checked-operator observation." }]);
  }
  if (existingCsharpOperation?.kind === "operator-token") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(existingCsharpOperation.operationId, "operator", existingCsharpOperation.operator),
      ...(existingCsharpOperation.resultType === undefined ? {} : { resultType: existingCsharpOperation.resultType }),
    }, [{ message: "C# source operator reused existing finalized C# operator-token fact for repeated checked-operator observation." }]);
  }
  if (existingCsharpOperation?.kind === "member" && isClosedCompatRuntimeOperationFact(existingCsharpOperation)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(existingCsharpOperation.operationId, "method", existingCsharpOperation.memberName),
      ...(existingCsharpOperation.resultType === undefined ? {} : { resultType: existingCsharpOperation.resultType }),
    }, [{ message: "C# source operator reused existing finalized closed compat-runtime C# operation fact for repeated checked-operator observation." }]);
  }
  if (existingCsharpOperation !== undefined) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' already has a finalized non-operator C# target operation.`);
  }
  const compatRuntimeOperator = typescriptCompatibilityMode === "compat"
    ? mapCsharpCompatRuntimeCheckedOperator(request, context)
    : deferObservation;
  if (compatRuntimeOperator.kind !== "defer") {
    return compatRuntimeOperator;
  }
  const opaqueAnyOperation = getCheckedOperatorOpaqueAnyOperation(request, context);
  if (opaqueAnyOperation !== undefined) {
    return rejectObservation(csharpOpaqueAnyOperationDiagnostic(
      context.extensionId,
      opaqueAnyOperation,
      typescriptCompatibilityMode,
      request.expression,
    ));
  }
  const typeofComparison = getTypeofComparisonOperation(request, context);
  if (typeofComparison !== undefined) {
    recordCsharpTargetOperation(context, request.expression, typeofComparison.csharpOperation, [{ message: "C# typeof comparison operation recorded from checked TSTS operator result." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: typeofComparison.operation,
      ...(typeofComparison.csharpOperation.resultType === undefined ? {} : { resultType: typeofComparison.csharpOperation.resultType }),
    }, [{ message: "C# typeof comparison selected from checked TSTS operator result." }]);
  }
  const typeofOperator = mapCsharpTypeofOperator(request, context, host);
  if (typeofOperator !== undefined) {
    return typeofOperator;
  }
  if (request.operator === "instanceof") {
    const boolType = csharpSourcePrimitiveTargetType("bool");
    const evidence = [{ message: "C# type-test operation recorded from checked TSTS instanceof expression." }];
    recordCsharpRuntimeCarrierFact(context.facts, request.expression, { carrier: boolType }, [{ message: "C# instanceof expression runtime carrier finalized as bool after TSTS accepted the source type-test operation." }]);
    recordCsharpTargetOperation(context, request.expression, csharpTargetIntrinsicOperatorOperation("tsonic.csharp.instanceof", CsharpTargetOperatorOperation.typeTest), evidence);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.instanceof", "operator", CsharpTargetOperatorOperation.typeTest),
      resultType: boolType,
    }, [{ message: "C# type-test operation selected from checked TSTS instanceof expression." }]);
  }
  const targetOperator = getCsharpOperatorTargetOperation(request.operator);
  if (targetOperator === undefined) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' has no finalized provider target operation.`);
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const { left, right } = getCheckedOperatorOperandTargetTypeRefs(request, context, operandQuery, host);
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return context.phase === "checking"
      ? deferObservation
      : rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' requires finalized target carrier facts for every exact TSTS-selected operand.`);
  }
  if (request.operator === "=" && (isCsharpAnyRuntimeCarrier(left) || isCsharpAnyRuntimeCarrier(right))) {
    const operationId = `tsonic.csharp.operator.${targetOperator}`;
    recordCsharpTargetOperation(context, request.expression, csharpTargetTokenOperatorOperation(operationId, targetOperator, left), [{ message: "C# assignment token operation recorded after TSTS accepted the source assignment; typed any-boundary validation is handled by post-check assignability facts." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(operationId, "operator", targetOperator),
      resultType: left,
    }, [{ message: "C# assignment operator accepted without dynamic any dispatch; target conversion or diagnostic is supplied by assignability validation." }]);
  }
  if (isCsharpAnyRuntimeCarrier(left) || isCsharpAnyRuntimeCarrier(right)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' requires explicit compat-runtime carrier operation facts for any operands.`);
  }
  if (request.operator !== "=" && (left.kind === "type-parameter" || right?.kind === "type-parameter")) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' requires finalized provider operator facts for type-parameter operands.`);
  }
  if (isCsharpBitwiseOperator(request.operator) && !isIntegralTargetTypeRef(left) && !isSourceEnumTargetTypeRef(left)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# bitwise operator '${request.operator}' requires integral, enum, or explicit provider operator facts.`);
  }
  if (isCsharpIncrementOrDecrementOperator(request.operator) && !isCsharpIncrementDecrementTargetTypeRef(left)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# increment/decrement operator '${request.operator}' requires numeric source-primitive or explicit provider operator facts.`);
  }
  if (operatorRequiresSelectedProviderIdentity(request.operator, left, right, host)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# provider-owned operator '${request.operator}' requires an exact finalized provider operator identity selected by TSTS. The current checked operator observation request exposes operands and symbols only, not a selected provider operator member id.`);
  }
  const resultType = getCsharpOperatorResultTypeRef(request, left, right, context);
  const operationId = `tsonic.csharp.operator.${targetOperator}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetTokenOperatorOperation(operationId, targetOperator, resultType), [{ message: "C# source operator token operation recorded after TSTS accepted the operation." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      operationId,
      "operator",
      targetOperator,
    ),
    resultType,
  }, [{ message: "C# source operator selected after TSTS accepted the operation." }]);
}

function rejectMissingCsharpOperatorFact(
  extensionId: string,
  message: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_OPERATOR_NOT_MAPPED", 9100146, message));
}

function getCsharpOperatorResultTypeRef(
  request: CheckedOperatorMappingRequest,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef {
  const expectedResult = request.operator === "??"
    ? getRecordedCsharpRuntimeCarrierFact(context.facts, request.expression)?.carrier
    : undefined;
  return getCsharpOperatorResultTypeRefForOperator(request.operator, left, right, expectedResult);
}
