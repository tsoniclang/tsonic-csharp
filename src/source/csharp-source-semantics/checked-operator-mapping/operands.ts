import {
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import {
  csharpSourcePrimitiveTargetType,
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";
import {
  csharpTargetTokenOperatorOperation,
  targetOperation,
} from "../operations.js";
import {
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isSourceEnumTargetTypeRef,
} from "../target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  isLiteralRepresentableAsTargetType,
} from "../target-member-selection.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "../operator-syntax.js";
import {
  asNodeSubject,
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  sourceDeclarationTargetType,
} from "../source-declaration-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  getLiteralTargetTypeRefForKnownOperatorOperand,
  getNullishTargetTypeRefForKnownOperatorOperand,
  operatorRequiresSelectedProviderIdentity,
} from "./operator-rules.js";

export function getOperatorSourceFile(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): SourceFile | undefined {
  const node = asNodeSubject(subject);
  return node === undefined ? undefined : context.compiler?.ast.getSourceFile(node);
}

export function getCheckedOperatorOperandTargetTypeRefs(
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

export function getBitwiseLiteralOperandTargetTypeRefs(
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
  const resultType = getCsharpOperatorResultTypeRefForOperator(operator, left, right, operator === "??" ? expectedResult : undefined);
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
