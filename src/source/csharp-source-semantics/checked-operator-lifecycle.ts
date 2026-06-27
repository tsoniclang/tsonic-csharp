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
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import {
  csharpTargetTokenOperatorOperation,
  targetOperation,
} from "./operations.js";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getCsharpOperatorTargetOperation,
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
          if (existingTargetOperation === undefined) {
            lifecycleContext.host.facts.set(node, targetOperationFactKey, operation.operation, [{ message: "C# checked operator fact finalized from deterministic target operand facts." }]);
            lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from deterministic target operand facts." }]);
            progressed = true;
          } else if (existingCsharpOperation === undefined && existingTargetOperation.operationId === operation.operation.operationId) {
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
): { readonly operation: CheckedOperationMappingResult["operation"]; readonly csharpOperation: ReturnType<typeof csharpTargetTokenOperatorOperation> } | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
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
  const targetOperator = operator === undefined ? undefined : getCsharpOperatorTargetOperation(operator);
  if (operator === undefined || targetOperator === undefined) {
    return undefined;
  }
  const leftSubject = binaryExpression !== undefined
    ? asNodeSubject(binaryExpression.Left)
    : asNodeSubject(prefixUnaryExpression?.Operand);
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
      context.compiler?.ast.is.IsPrefixUnaryExpression(node) === true)
  ) {
    const operation = getCsharpCheckedOperatorFactsFromSyntax(node, context, host);
    if (operation !== undefined) {
      context.host.facts.set(node, targetOperationFactKey, operation.operation, [{ message: "C# checked operator fact finalized from deterministic nested target operand facts." }]);
      context.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from deterministic nested target operand facts." }]);
      return operation.csharpOperation.resultType;
    }
    return undefined;
  }
  const direct = host.getTargetTypeRefForSubject(subject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (direct !== undefined || sourceFile === undefined) {
    return direct;
  }
  const checker = context.compiler?.checker;
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
