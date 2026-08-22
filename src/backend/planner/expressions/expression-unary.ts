import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  sourceOperatorFromKindName,
} from "../../../target-model/syntax/operators.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  csharpPostfixUnaryOperatorTokenFromText,
  csharpPrefixUnaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function planPrefixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operandNode = input.program.source.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.program.source.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredJsValueObjectShapeUpdate(
      node,
      operandNode,
      sourceOperator,
      input,
      diagnostics,
    )
  ) {
    return undefined;
  }
  if (sourceOperator !== undefined) {
    const classification = input.program.operations.unary(node);
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
        : translateCsharpJsValueInvocation(
            jsValueOperation,
            undefined,
            [
              operand,
              { kind: "LiteralExpression", value: sourceOperator },
            ],
          );
    }
  }
  const classification = input.program.operations.unary(node);
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
  const operand = planExpression(
    selection.operand,
    sourceFile,
    input,
    diagnostics,
  );
  return operand === undefined
    ? undefined
    : {
        kind: "PrefixUnaryExpression",
        operatorToken,
        operand,
      };
}

export function planPostfixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operandNode = input.program.source.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.program.source.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredJsValueObjectShapeUpdate(
      node,
      operandNode,
      sourceOperator,
      input,
      diagnostics,
    )
  ) {
    return undefined;
  }
  if (sourceOperator !== undefined) {
    const classification = input.program.operations.unary(node);
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
        : translateCsharpJsValueInvocation(
            jsValueOperation,
            undefined,
            [
              operand,
              { kind: "LiteralExpression", value: sourceOperator },
            ],
          );
    }
  }
  const classification = input.program.operations.unary(node);
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
  const operand = planExpression(
    selection.operand,
    sourceFile,
    input,
    diagnostics,
  );
  return operand === undefined
    ? undefined
    : {
        kind: "PostfixUnaryExpression",
        operand,
        operatorToken,
      };
}

function rejectUnloweredJsValueObjectShapeUpdate(
  node: Node,
  operand: Node | undefined,
  sourceOperator: string | undefined,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): boolean {
  if (
    (sourceOperator !== "++" && sourceOperator !== "--") ||
    operand === undefined ||
    !input.program.source.ast.is.IsPropertyAccessExpression(operand)
  ) {
    return false;
  }
  const classification = input.program.operations.property(operand);
  if (classification === undefined) {
    return false;
  }
  const selection = classification.selection;
  if (selection.kind !== "source-owned") {
    return false;
  }
  const jsValueProperty = classification.sourceOwned?.jsValueProperty;
  if (jsValueProperty === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A source-owned property update has no sealed C# property classification.",
    ));
    return true;
  }
  if (jsValueProperty.kind === "not-js-value-object-shape") {
    return false;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    node,
    jsValueProperty.kind === "rejected"
      ? jsValueProperty.reason
      : `Closed JS-value object-shape update '${sourceOperator}' requires an exact writable-location translation; emitting a read expression as a C# location is forbidden.`,
  ));
  return true;
}
