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
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  getLiteralTargetTypeRefForKnownOperatorOperand,
  getNullishTargetTypeRefForKnownOperatorOperand,
} from "./checked-operator-mapping.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carriers.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";

export interface CsharpCheckedOperatorLifecycleHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
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
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const operation = getCsharpCheckedOperatorFactsFromSyntax(node, context, host);
      if (operation !== undefined) {
        lifecycleContext.host.facts.set(node, targetOperationFactKey, operation.operation, [{ message: "C# checked operator fact finalized from deterministic target operand facts." }]);
        lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation.csharpOperation, [{ message: "C# checked operator token operation finalized from deterministic target operand facts." }]);
      }
    });
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
  const operator = ast.is.IsBinaryExpression(node)
    ? getBinaryOperatorText(ast, node)
    : ast.kindName(node) === "KindPrefixUnaryExpression"
      ? getPrefixUnaryOperatorText(ast, node)
      : undefined;
  const targetOperator = operator === undefined ? undefined : getCsharpOperatorTargetOperation(operator);
  if (operator === undefined || targetOperator === undefined) {
    return undefined;
  }
  const leftSubject = ast.is.IsBinaryExpression(node)
    ? asNodeSubject(getNodeField(node, "Left"))
    : asNodeSubject(getNodeField(node, "Operand"));
  const rightSubject = ast.is.IsBinaryExpression(node)
    ? asNodeSubject(getNodeField(node, "Right"))
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
  if (operator !== "=" && (left.kind === "type-parameter" || right?.kind === "type-parameter")) {
    return undefined;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left) && !isSourceEnumTargetTypeRef(left)) {
    return undefined;
  }
  const resultType = getCsharpOperatorResultTypeRefForOperator(operator, left, right);
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
  const direct = host.getTargetTypeRefForSubject(subject, context, {
    ...options,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
  if (direct !== undefined || sourceFile === undefined) {
    return direct;
  }
  const node = asNodeSubject(subject);
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
