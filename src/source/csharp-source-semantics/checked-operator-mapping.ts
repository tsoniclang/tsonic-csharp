import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "./identity.js";
import {
  CsharpTargetOperatorOperation,
} from "../csharp-facts.js";
import {
  csharpTargetIntrinsicOperatorOperation,
  csharpTargetTokenOperatorOperation,
  csharpTargetTypeofRuntimeOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "./operations.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getTypeofComparisonOperation,
  getTypeofRuntimeKind,
} from "./typeof-operators.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const typeofComparison = getTypeofComparisonOperation(request, context);
  if (typeofComparison !== undefined) {
    recordCsharpTargetOperation(context, request.expression, typeofComparison.csharpOperation, [{ message: "C# typeof comparison operation recorded from checked TSTS operator result." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: typeofComparison.operation,
    }, [{ message: "C# typeof comparison selected from checked TSTS operator result." }]);
  }
  if (request.operator === "typeof") {
    const operandType = host.getTargetTypeRefForSubject(request.leftType, context, noRuntimeCarrierQuery) ??
      host.getTargetTypeRefForSubject(request.left, context, noRuntimeCarrierQuery);
    const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
    if (runtimeKind === undefined) {
      return deferObservation;
    }
    const operationId = `tsonic.csharp.typeof.${runtimeKind}`;
    recordCsharpTargetOperation(context, request.expression, csharpTargetTypeofRuntimeOperation(operationId, runtimeKind), [{ message: "C# typeof runtime operation recorded from checked TSTS operand type." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(operationId, "operator", "typeof"),
    }, [{ message: "C# typeof runtime kind selected from checked TSTS operand type." }]);
  }
  if (request.operator === "instanceof") {
    recordCsharpTargetOperation(context, request.expression, csharpTargetIntrinsicOperatorOperation("tsonic.csharp.instanceof", CsharpTargetOperatorOperation.typeTest), [{ message: "C# type-test operation recorded from checked TSTS instanceof expression." }]);
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.instanceof", "operator", CsharpTargetOperatorOperation.typeTest),
    }, [{ message: "C# type-test operation selected from checked TSTS instanceof expression." }]);
  }
  const targetOperator = getCsharpOperatorTargetOperation(request.operator);
  if (targetOperator === undefined) {
    return deferObservation;
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const left = host.getTargetTypeRefForSubject(request.leftType, context) ??
    host.getTargetTypeRefForSubject(request.left, context, operandQuery);
  const right = host.getTargetTypeRefForSubject(request.rightType, context) ??
    host.getTargetTypeRefForSubject(request.right, context, operandQuery) ??
    getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context);
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return deferObservation;
  }
  if (left.kind === "type-parameter" || right?.kind === "type-parameter") {
    return deferObservation;
  }
  if (isCsharpBitwiseOperator(request.operator) && !isIntegralTargetTypeRef(left)) {
    return deferObservation;
  }
  const resultType = getCsharpOperatorResultTypeRef(request, left, right);
  const operationId = `tsonic.csharp.operator.${targetOperator}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetTokenOperatorOperation(operationId, targetOperator, resultType), [{ message: "C# source operator token operation recorded after TSTS accepted the operation." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      operationId,
      "operator",
      targetOperator,
      { resultType },
    ),
  }, [{ message: "C# source operator selected after TSTS accepted the operation." }]);
}

export function getCsharpOperatorResultTypeRefForOperator(
  operator: string,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case "typeof":
      return csharpTargetNamedType("System.String");
    case "??":
      return unwrapNullableTargetType(left) ?? right ?? left;
    default:
      return left;
  }
}

export function getCheckedOperatorOperandQuery(_operator: string): TargetTypeRefResolutionOptions {
  return {};
}

export function getLiteralTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const unwrappedExpected = unwrapNullableTargetType(expectedOperandType);
  return unwrappedExpected !== undefined && isLiteralRepresentableAsTargetType(unwrappedExpected, operand, context)
    ? unwrappedExpected
    : undefined;
}

function getCsharpOperatorResultTypeRef(
  request: CheckedOperatorMappingRequest,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  return getCsharpOperatorResultTypeRefForOperator(request.operator, left, right);
}
