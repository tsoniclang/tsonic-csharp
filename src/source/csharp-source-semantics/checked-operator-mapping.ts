import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpTargetOperationFactKey,
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
  csharpStringTargetType,
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isSourceEnumTargetTypeRef,
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
import {
  asNodeSubject,
  isSemanticTypeQueryableValueExpressionNode,
} from "./ast-utils.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# source operator reused existing finalized target operation for repeated checked-operator observation." }]);
  }
  if (context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) !== undefined) {
    return acceptMissingCsharpOperatorFact(request, `C# operator '${request.operator}' already has a finalized C# target operation but no generic target operation fact.`);
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
      return acceptMissingCsharpOperatorFact(request, "C# typeof runtime operation requires finalized provider runtime-kind facts.");
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
    return acceptMissingCsharpOperatorFact(request, `C# operator '${request.operator}' has no finalized provider target operation.`);
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const sourceFile = getOperatorSourceFile(request.expression, context);
  const operands = getCheckedOperatorOperandTargetTypeRefs(request, sourceFile, context, operandQuery, host);
  const left = operands.left;
  const right = operands.right;
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return acceptMissingCsharpOperatorFact(request, `C# operator '${request.operator}' requires finalized provider operand carrier facts.`);
  }
  if (isCsharpAnyRuntimeCarrier(left) || isCsharpAnyRuntimeCarrier(right)) {
    return acceptMissingCsharpOperatorFact(request, `C# operator '${request.operator}' requires explicit compat-runtime carrier operation facts for any operands.`);
  }
  if (request.operator !== "=" && (left.kind === "type-parameter" || right?.kind === "type-parameter")) {
    return acceptMissingCsharpOperatorFact(request, `C# operator '${request.operator}' requires finalized provider operator facts for type-parameter operands.`);
  }
  if (isCsharpBitwiseOperator(request.operator) && !isIntegralTargetTypeRef(left) && !isSourceEnumTargetTypeRef(left)) {
    return acceptMissingCsharpOperatorFact(request, `C# bitwise operator '${request.operator}' requires integral, enum, or explicit provider operator facts.`);
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

function acceptMissingCsharpOperatorFact(
  request: CheckedOperatorMappingRequest,
  message: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(`tsonic.csharp.operator.missing.${request.operator}`, "operator", request.operator),
  }, [{ message }]);
}

function getCheckedOperatorOperandTargetTypeRefs(
  request: CheckedOperatorMappingRequest,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  operandQuery: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): { readonly left: TargetTypeRef | undefined; readonly right: TargetTypeRef | undefined } {
  let left = getCheckedOperatorOperandTargetTypeRef(request.leftType, request.left, sourceFile, context, operandQuery, host);
  let right = getCheckedOperatorOperandTargetTypeRef(request.rightType, request.right, sourceFile, context, operandQuery, host);
  if (request.right === undefined && left === undefined) {
    left = context.factResolver.resolve(request.expression, runtimeCarrierFactKey)?.carrier;
  }
  if (right === undefined) {
    right = getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(left, request.right, sourceFile, context);
  }
  if (left === undefined) {
    left = getLiteralTargetTypeRefForKnownOperatorOperand(right, request.left, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(right, request.left, sourceFile, context);
  }
  return { left, right };
}

function getOperatorSourceFile(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): SourceFile | undefined {
  const node = asNodeSubject(subject);
  return node === undefined ? undefined : context.compiler?.ast.getSourceFile(node);
}

function getCheckedOperatorOperandTargetTypeRef(
  typeSubject: ExtensionFactSubject | undefined,
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const typed = host.getTargetTypeRefForSubject(typeSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (typed !== undefined) {
    return typed;
  }
  const direct = host.getTargetTypeRefForSubject(expressionSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (direct !== undefined || sourceFile === undefined) {
    return direct;
  }
  const node = asNodeSubject(expressionSubject);
  const checker = context.compiler?.checker;
  if (
    node === undefined ||
    checker === undefined ||
    context.compiler?.ast === undefined ||
    !isSemanticTypeQueryableValueExpressionNode(context.compiler.ast, node)
  ) {
    return undefined;
  }
  try {
    return host.getTargetTypeRefForSubject(checker.getTypeAtLocation(node, { sourceFile }), context, {
      ...options,
      sourceFile,
    });
  } catch {
    return undefined;
  }
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
      return csharpStringTargetType();
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

export function getNullishTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return expectedOperandType !== undefined && isNullishExpressionOperand(operand, sourceFile, context)
    ? expectedOperandType
    : undefined;
}

function isNullishExpressionOperand(
  operand: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(operand);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  const kind = compiler.ast.kindName(node);
  if (kind === "KindNullKeyword" || kind === "KindVoidExpression") {
    return true;
  }
  if (kind !== "KindIdentifier" || compiler.ast.text(node) !== "undefined") {
    return false;
  }
  try {
    const checkedSourceFile = sourceFile ?? compiler.ast.getSourceFile(node);
    const type = compiler.checker.getTypeAtLocation(node, { sourceFile: checkedSourceFile });
    return type === undefined ? false : compiler.types.isNullish(type);
  } catch {
    return false;
  }
}

function getCsharpOperatorResultTypeRef(
  request: CheckedOperatorMappingRequest,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  return getCsharpOperatorResultTypeRefForOperator(request.operator, left, right);
}
