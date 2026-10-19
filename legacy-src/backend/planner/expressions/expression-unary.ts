import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedUnaryOperation } from "../../../target-model/records/operator-selection.js";
import {
  sourceOperatorFromKindName,
} from "../../../target-model/syntax/operators.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  csharpPostfixUnaryOperatorTokenFromText,
  csharpPrefixUnaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  failCsharpPlannerInvariant,
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";
import { planCsharpExactLiteralConversion } from "./literal-conversions.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion, projectCsharpPlannedValue } from "./planned-value-composition.js";

export function planPrefixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const operandNode = input.program.source.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.program.source.ast.operatorKindName(node),
  );
  const form = input.program.records.operatorForm.get(node);
  if (form === "js-value-object-shape-update") {
    return failCsharpPlannerInvariant("An admitted native unary cannot retain a rejected JS-value object-shape update.", node);
  }
  if (form === "js-value-operation" && sourceOperator !== undefined) {
    const classification = input.program.records.unaryOperation.get(node);
    if (classification === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# planning received a unary expression without a sealed target classification.",
      ));
      return undefined;
    }
    const jsValueOperation = classification.jsValue;
    if (jsValueOperation.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
      return undefined;
    }
    if (jsValueOperation.kind === "resolved") {
      const operand = operandNode === undefined
        ? undefined
        : planExpression(operandNode, sourceFile, input, diagnostics);
      return operand === undefined
        ? undefined
        : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, operand, value => translateCsharpJsValueInvocation(
            input.scope.typeParameterNames,
            jsValueOperation,
            undefined,
            [
              value,
            ],
          ));
    }
  }
  const classification = input.program.records.unaryOperation.get(node);
  if (classification === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a unary expression without a sealed target classification.",
    ));
    return undefined;
  }
  const selection = classification.target;
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  if (Object.is(input.program.records.literalValue.get(node)?.number, -0)) {
    const literal = planCsharpExactLiteralConversion(input, node, selection.resultType);
    if (literal.kind === "resolved") return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, literal.expression, selection.resultType);
    if (literal.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, literal.reason));
      return undefined;
    }
  }
  const operatorToken = csharpPrefixUnaryOperatorTokenFromText(
    selection.targetOperator,
  );
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected prefix operator '${selection.targetOperator}' has no C# AST token.`,
    ));
    return undefined;
  }
  const operand = planUnaryOperand(
    selection,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  return operand === undefined
    ? undefined
    : mapCsharpPlannedValue(operand, selection.resultType, value => ({
        kind: "PrefixUnaryExpression",
        operatorToken,
        operand: value,
      }));
}

export function planPostfixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const operandNode = input.program.source.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.program.source.ast.operatorKindName(node),
  );
  const form = input.program.records.operatorForm.get(node);
  if (form === "js-value-object-shape-update") {
    return failCsharpPlannerInvariant("An admitted native unary cannot retain a rejected JS-value object-shape update.", node);
  }
  if (form === "js-value-operation" && sourceOperator !== undefined) {
    const classification = input.program.records.unaryOperation.get(node);
    if (classification === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# planning received a unary expression without a sealed target classification.",
      ));
      return undefined;
    }
    const jsValueOperation = classification.jsValue;
    if (jsValueOperation.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
      return undefined;
    }
    if (jsValueOperation.kind === "resolved") {
      const operand = operandNode === undefined
        ? undefined
        : planExpression(operandNode, sourceFile, input, diagnostics);
      return operand === undefined
        ? undefined
        : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, operand, value => translateCsharpJsValueInvocation(
            input.scope.typeParameterNames,
            jsValueOperation,
            undefined,
            [
              value,
            ],
          ));
    }
  }
  const classification = input.program.records.unaryOperation.get(node);
  if (classification === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a unary expression without a sealed target classification.",
    ));
    return undefined;
  }
  const selection = classification.target;
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  const operatorToken = csharpPostfixUnaryOperatorTokenFromText(
    selection.targetOperator,
  );
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected postfix operator '${selection.targetOperator}' has no C# AST token.`,
    ));
    return undefined;
  }
  const operand = planUnaryOperand(
    selection,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  return operand === undefined
    ? undefined
    : mapCsharpPlannedValue(operand, selection.resultType, value => ({
        kind: "PostfixUnaryExpression",
        operand: value,
        operatorToken,
      }));
}

function planUnaryOperand(
  selection: CsharpResolvedUnaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (selection.sourceOperator !== "++" && selection.sourceOperator !== "--") {
    return planExpression(selection.operand, sourceFile, input, diagnostics);
  }
  let storageExpression = selection.operand;
  while (input.program.source.ast.is.IsParenthesizedExpression(storageExpression)) {
    const inner = input.program.source.ast.as.AsParenthesizedExpression(storageExpression)?.Expression;
    if (inner === undefined) {
      failCsharpPlannerInvariant("A selected parenthesized native update location has no operand.", storageExpression);
    }
    storageExpression = inner;
  }
  return planExpression(selection.operand, sourceFile, { ...input, storageExpression }, diagnostics);
}
