import {
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getBinaryOperatorText,
  getPostfixUnaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import {
  csharpTargetTypeofRuntimeOperation,
  csharpTargetTokenOperatorOperation,
  recordTargetOperationFact,
  targetOperation,
  targetOperationFactsAreStructurallyIdentical,
} from "./operations.js";
import {
  CsharpTargetOperationFact,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getCsharpOperatorTargetOperation,
  isCsharpIncrementDecrementTargetTypeRef,
  isCsharpIncrementOrDecrementOperator,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isSourceEnumTargetTypeRef,
} from "./target-rules.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  getLiteralTargetTypeRefForKnownOperatorOperand,
  getNullishTargetTypeRefForKnownOperatorOperand,
  operatorRequiresSelectedProviderIdentity,
} from "./checked-operator-mapping/index.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carriers.js";
import {
  getTypeofRuntimeKind,
} from "./typeof-operators.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpProviderConversionOperatorHost,
} from "./provider-conversion-operators.js";

export interface CsharpCheckedOperatorLifecycleHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getCsharpTargetBindingByTargetId: CsharpProviderConversionOperatorHost["getCsharpTargetBindingByTargetId"];
}

export function recordCsharpCheckedOperatorFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpCheckedOperatorLifecycleHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    const nodes: Node[] = [];
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      nodes.push(node);
    });
    const pending = nodes.reverse();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const node of pending) {
        const existingTargetOperation = lifecycleContext.host.facts.get(node, targetOperationFactKey);
        const existingCsharpOperation = lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey);
        if (existingTargetOperation !== undefined && existingCsharpOperation !== undefined) {
          continue;
        }
        const operation = getCsharpCheckedOperatorFactsFromSyntax(node, context, host);
        if (operation !== undefined) {
          const targetOperationWrite = recordTargetOperationFact(lifecycleContext.host, node, operation.operation, [{ message: "C# checked operator fact finalized from deterministic target operand facts." }]);
          if (targetOperationWrite === "conflict" || targetOperationWrite === "sealed" || targetOperationWrite === "invalid-subject") {
            continue;
          }
          if (existingTargetOperation === undefined) {
            lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from deterministic target operand facts." }]);
            progressed = true;
          } else if (existingCsharpOperation === undefined && targetOperationFactsAreStructurallyIdentical(existingTargetOperation, operation.operation)) {
            lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from existing checked TSTS/provider operator fact." }]);
            progressed = true;
          }
        }
      }
    }
  }
}

function getCsharpCheckedOperatorFactsFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpCheckedOperatorLifecycleHost,
): { readonly operation: CheckedOperationMappingResult["operation"]; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const typeofRuntimeFacts = getCsharpTypeofRuntimeFactsFromSyntax(node, context, host);
  if (typeofRuntimeFacts !== undefined) {
    return typeofRuntimeFacts;
  }
  const binaryExpression = ast.is.IsBinaryExpression(node)
    ? ast.as.AsBinaryExpression(node)
    : undefined;
  const prefixUnaryExpression = ast.is.IsPrefixUnaryExpression(node)
    ? ast.as.AsPrefixUnaryExpression(node)
    : undefined;
  const postfixUnaryExpression = ast.is.IsPostfixUnaryExpression(node)
    ? ast.as.AsPostfixUnaryExpression(node)
    : undefined;
  const operator = binaryExpression !== undefined
    ? getBinaryOperatorText(ast, node)
    : prefixUnaryExpression !== undefined
      ? getPrefixUnaryOperatorText(ast, node)
      : postfixUnaryExpression !== undefined
        ? getPostfixUnaryOperatorText(ast, node)
      : undefined;
  const targetOperator = operator === undefined ? undefined : getCsharpOperatorTargetOperation(operator);
  if (operator === undefined || targetOperator === undefined) {
    return undefined;
  }
  const leftSubject = binaryExpression !== undefined
    ? asNodeSubject(binaryExpression.Left)
    : asNodeSubject(prefixUnaryExpression?.Operand ?? postfixUnaryExpression?.Operand);
  const rightSubject = binaryExpression !== undefined
    ? asNodeSubject(binaryExpression.Right)
    : undefined;
  const operandQuery = getCheckedOperatorOperandQuery(operator);
  const sourceFile = ast.getSourceFile(node);
  let left = getTargetTypeRefForCheckedOperand(leftSubject, sourceFile, context, operandQuery, host);
  let right = getTargetTypeRefForCheckedOperand(rightSubject, sourceFile, context, operandQuery, host);
  const expectedResult = context.factResolver.resolve(node, runtimeCarrierFactKey)?.carrier;
  if (!ast.is.IsBinaryExpression(node) && left === undefined) {
    left = expectedResult;
  }
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
  if (isCsharpIncrementOrDecrementOperator(operator) && !isCsharpIncrementDecrementTargetTypeRef(left)) {
    return undefined;
  }
  if (operatorRequiresSelectedProviderIdentity(operator, left, right, host)) {
    return undefined;
  }
  const resultType = getCsharpOperatorResultTypeRefForOperator(operator, left, right, expectedResult);
  const operationId = `tsonic.csharp.operator.${targetOperator}`;
  return {
    operation: targetOperation(
      operationId,
      "operator",
      targetOperator,
      { resultType },
    ),
    csharpOperation: csharpTargetTokenOperatorOperation(operationId, targetOperator, resultType),
  };
}

function getCsharpTypeofRuntimeFactsFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpCheckedOperatorLifecycleHost,
): { readonly operation: CheckedOperationMappingResult["operation"]; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || !ast.is.IsTypeOfExpression(node)) {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Expression"));
  const operandType = getTargetTypeRefForCheckedOperand(
    operand,
    ast.getSourceFile(node),
    context,
    { allowRuntimeCarrier: false },
    host,
  );
  const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
  if (runtimeKind === undefined) {
    return undefined;
  }
  const operationId = `tsonic.csharp.typeof.${runtimeKind}`;
  return {
    operation: targetOperation(operationId, "operator", "typeof"),
    csharpOperation: csharpTargetTypeofRuntimeOperation(operationId, runtimeKind),
  };
}

function getTargetTypeRefForCheckedOperand(
  subject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpCheckedOperatorLifecycleHost,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const parenthesizedExpression = node !== undefined && context.compiler?.ast.is.IsParenthesizedExpression(node) === true
    ? context.compiler.ast.as.AsParenthesizedExpression(node)
    : undefined;
  if (parenthesizedExpression !== undefined) {
    return getTargetTypeRefForCheckedOperand(parenthesizedExpression.Expression, sourceFile, context, options, host);
  }
  const selectedOperationResult = context.host.facts.get(node, csharpTargetOperationFactKey)?.resultType ??
    (subject === undefined
      ? undefined
      : context.factResolver.resolve(subject, csharpTargetOperationFactKey)?.resultType);
  if (selectedOperationResult !== undefined) {
    return selectedOperationResult;
  }
  if (
    node !== undefined &&
    (context.compiler?.ast.is.IsBinaryExpression(node) === true ||
      context.compiler?.ast.is.IsPrefixUnaryExpression(node) === true ||
      context.compiler?.ast.is.IsPostfixUnaryExpression(node) === true)
  ) {
    const operation = getCsharpCheckedOperatorFactsFromSyntax(node, context, host);
    if (operation !== undefined) {
      recordTargetOperationFact(context.host, node, operation.operation, [{ message: "C# checked operator fact finalized from deterministic nested target operand facts." }]);
      context.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from deterministic nested target operand facts." }]);
      return operation.csharpOperation.resultType;
    }
    return undefined;
  }
  const direct = host.getTargetTypeRefForSubject(subject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (direct !== undefined && direct.kind !== "type-parameter") {
    return direct;
  }
  const checked = getCheckedExpressionTargetTypeRef(subject, sourceFile, context, options, host);
  if (checked !== undefined && checked.kind !== "type-parameter") {
    return checked;
  }
  if (direct !== undefined || sourceFile === undefined) {
    return direct;
  }
  return checked;
}

function getCheckedExpressionTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpCheckedOperatorLifecycleHost,
): TargetTypeRef | undefined {
  if (sourceFile === undefined) {
    return undefined;
  }
  const checker = context.compiler?.checker;
  const node = asNodeSubject(subject);
  if (node === undefined || checker === undefined) {
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
