import {
  acceptObservation,
  deferObservation,
  rejectObservation,
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
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
} from "./ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import {
  sourceDeclarationTargetType,
} from "./source-declaration-facts.js";
import {
  type CsharpProviderConversionOperatorHost,
  isCsharpProviderOwnedTargetType,
} from "./provider-conversion-operators.js";

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
  const existingCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey);
  if (existingCsharpOperation?.kind === "operator-token") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(existingCsharpOperation.operationId, "operator", existingCsharpOperation.operator, {
        resultType: existingCsharpOperation.resultType,
      }),
    }, [{ message: "C# source operator reused existing finalized C# operator-token fact for repeated checked-operator observation." }]);
  }
  if (existingCsharpOperation !== undefined) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' already has a finalized non-operator C# target operation.`);
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
      if (isTypeofOperandConsumedByParentComparison(request.expression, context)) {
        return acceptObservation<CheckedOperationMappingResult>({
          operation: targetOperation("tsonic.csharp.typeof.comparison-operand", "operator", "typeof"),
        }, [{ message: "C# typeof operand is consumed by a parent checked typeof comparison and does not require standalone runtime-kind emission." }]);
      }
      return rejectObservation(csharpProviderDiagnostic(context.extensionId, "CSHARP_TYPEOF_RUNTIME_FACT_NOT_PROVEN", 9100146, "C# typeof expression emission requires a selected provider typeof operator fact."));
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
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' has no finalized provider target operation.`);
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const sourceFile = getOperatorSourceFile(request.expression, context);
  const operands = getCheckedOperatorOperandTargetTypeRefs(request, sourceFile, context, operandQuery, host);
  const bitwiseLiteralOperands = getBitwiseLiteralOperandTargetTypeRefs(request.operator, operands.left, operands.right, request.left, request.right, context);
  const left = bitwiseLiteralOperands.left;
  const right = bitwiseLiteralOperands.right;
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# operator '${request.operator}' requires finalized provider operand carrier facts.`);
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
  if (operatorRequiresSelectedProviderIdentity(request.operator, left, right, host)) {
    return rejectMissingCsharpOperatorFact(context.extensionId, `C# provider-owned operator '${request.operator}' requires an exact finalized provider operator identity selected by TSTS. The current checked operator observation request exposes operands and symbols only, not a selected provider operator member id.`);
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

function rejectMissingCsharpOperatorFact(
  extensionId: string,
  message: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_OPERATOR_NOT_MAPPED", 9100146, message));
}

function isTypeofOperandConsumedByParentComparison(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined || !ast.is.IsTypeOfExpression(node)) {
    return false;
  }
  const parent = ast.parent(node);
  if (parent === undefined || !ast.is.IsBinaryExpression(parent)) {
    return false;
  }
  const operator = getBinaryOperatorText(ast, parent);
  if (operator !== "===" && operator !== "==" && operator !== "!==" && operator !== "!=") {
    return false;
  }
  const left = asNodeSubject(getNodeField(parent, "Left"));
  const right = asNodeSubject(getNodeField(parent, "Right"));
  const literal = left === node ? right : right === node ? left : undefined;
  if (literal === undefined || !ast.is.IsStringLiteral(literal)) {
    return false;
  }
  const text = ast.text(literal);
  return text === "string" || text === "number" || text === "boolean" || text === "bigint";
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

function getBitwiseLiteralOperandTargetTypeRefs(
  operator: string,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
  leftSubject: ExtensionFactSubject | undefined,
  rightSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): { readonly left: TargetTypeRef | undefined; readonly right: TargetTypeRef | undefined } {
  if (!isCsharpBitwiseOperator(operator)) {
    return { left, right };
  }
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const enumLeft = getContainingEnumDeclarationTargetType(leftSubject, context);
  const enumRight = getContainingEnumDeclarationTargetType(rightSubject, context);
  const normalizedLeft = isIntegralTargetTypeRef(left) || isSourceEnumTargetTypeRef(left)
    ? left
    : enumLeft !== undefined
      ? enumLeft
    : isLiteralRepresentableAsTargetType(int32, leftSubject, context)
      ? int32
      : left;
  const normalizedRight = rightSubject === undefined || isIntegralTargetTypeRef(right) || isSourceEnumTargetTypeRef(right)
    ? right
    : enumRight !== undefined
      ? enumRight
    : isLiteralRepresentableAsTargetType(int32, rightSubject, context)
      ? int32
      : right;
  return { left: normalizedLeft, right: normalizedRight };
}

function getContainingEnumDeclarationTargetType(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  let node = asNodeSubject(subject);
  if (ast === undefined || node === undefined || !ast.is.IsIdentifier(node)) {
    return undefined;
  }
  while (ast !== undefined && node !== undefined) {
    if (ast.kindName(node) === "KindEnumDeclaration") {
      const name = ast.name(node);
      return name === undefined
        ? undefined
        : sourceDeclarationTargetType(ast.text(name), "KindEnumDeclaration");
    }
    if (ast.kindName(node) === "KindSourceFile") {
      return undefined;
    }
    node = ast.parent(node);
  }
  return undefined;
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
  const selectedOperationResult = expressionSubject === undefined
    ? undefined
    : context.factResolver.resolve(expressionSubject, csharpTargetOperationFactKey)?.resultType;
  if (selectedOperationResult !== undefined) {
    return selectedOperationResult;
  }
  const nestedOperationResult = getNestedCheckedOperatorTargetTypeRef(expressionSubject, sourceFile, context, options, host);
  if (nestedOperationResult !== undefined) {
    return nestedOperationResult;
  }
  const direct = host.getTargetTypeRefForSubject(expressionSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (direct !== undefined) {
    return direct;
  }
  const typed = host.getTargetTypeRefForSubject(typeSubject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (typed !== undefined) {
    return typed;
  }
  if (sourceFile === undefined) {
    return undefined;
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

function getNestedCheckedOperatorTargetTypeRef(
  expressionSubject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const node = asNodeSubject(expressionSubject);
  const ast = context.compiler?.ast;
  if (node === undefined || ast === undefined) {
    return undefined;
  }
  if (ast.is.IsParenthesizedExpression(node)) {
    return getNestedCheckedOperatorTargetTypeRef(getNodeField(node, "Expression") as ExtensionFactSubject | undefined, sourceFile, context, options, host);
  }
  const binaryExpression = ast.is.IsBinaryExpression(node)
    ? ast.as.AsBinaryExpression(node)
    : undefined;
  const prefixUnaryExpression = ast.is.IsPrefixUnaryExpression(node)
    ? ast.as.AsPrefixUnaryExpression(node)
    : undefined;
  const operator = binaryExpression !== undefined
    ? getBinaryOperatorText(ast, node)
    : prefixUnaryExpression !== undefined
      ? getPrefixUnaryOperatorText(ast, node)
      : undefined;
  const targetOperator = operator === undefined
    ? undefined
    : getCsharpOperatorTargetOperation(operator);
  if (operator === undefined || targetOperator === undefined) {
    return undefined;
  }
  const leftSubject = binaryExpression !== undefined
    ? asNodeSubject(binaryExpression.Left)
    : asNodeSubject(prefixUnaryExpression?.Operand);
  const rightSubject = binaryExpression !== undefined
    ? asNodeSubject(binaryExpression.Right)
    : undefined;
  const nestedOptions = getCheckedOperatorOperandQuery(operator);
  let left = getCheckedOperatorOperandTargetTypeRef(undefined, leftSubject, sourceFile, context, nestedOptions, host);
  let right = getCheckedOperatorOperandTargetTypeRef(undefined, rightSubject, sourceFile, context, nestedOptions, host);
  const expectedResult = context.factResolver.resolve(node, runtimeCarrierFactKey)?.carrier;
  if (right === undefined) {
    right = getLiteralTargetTypeRefForKnownOperatorOperand(left, rightSubject, context) ??
      getLiteralTargetTypeRefForKnownOperatorOperand(expectedResult, rightSubject, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(left, rightSubject, sourceFile, context);
  }
  if (left === undefined) {
    left = getLiteralTargetTypeRefForKnownOperatorOperand(right, leftSubject, context) ??
      getLiteralTargetTypeRefForKnownOperatorOperand(expectedResult, leftSubject, context) ??
      getNullishTargetTypeRefForKnownOperatorOperand(right, leftSubject, sourceFile, context);
  }
  const bitwiseLiteralOperands = getBitwiseLiteralOperandTargetTypeRefs(operator, left, right, leftSubject, rightSubject, context);
  left = bitwiseLiteralOperands.left;
  right = bitwiseLiteralOperands.right;
  if (left === undefined || (rightSubject !== undefined && right === undefined)) {
    return undefined;
  }
  if (isCsharpAnyRuntimeCarrier(left) || isCsharpAnyRuntimeCarrier(right)) {
    return undefined;
  }
  if (operator !== "=" && (left.kind === "type-parameter" || right?.kind === "type-parameter")) {
    return undefined;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left) && !isSourceEnumTargetTypeRef(left)) {
    return undefined;
  }
  if (operatorRequiresSelectedProviderIdentity(operator, left, right, host)) {
    return undefined;
  }
  const resultType = getCsharpOperatorResultTypeRefForOperator(operator, left, right);
  const operationId = `tsonic.csharp.operator.${targetOperator}`;
  const operation = targetOperation(
    operationId,
    "operator",
    targetOperator,
    { resultType },
  );
  context.facts.set(node, targetOperationFactKey, operation, [{ message: "C# nested checked operator fact finalized during checked-operator mapping from deterministic operand facts." }]);
  context.facts.set(node, csharpTargetOperationFactKey, csharpTargetTokenOperatorOperation(operationId, targetOperator, resultType), [{ message: "C# nested checked operator token fact finalized during checked-operator mapping from deterministic operand facts." }]);
  void options;
  return resultType;
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

export function operatorRequiresSelectedProviderIdentity(
  operator: string,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
  host: CsharpProviderConversionOperatorHost,
): boolean {
  if (operator === "=") {
    return false;
  }
  return isCsharpProviderOwnedTargetType(left, host) || isCsharpProviderOwnedTargetType(right, host);
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
