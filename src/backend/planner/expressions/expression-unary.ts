import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpUnaryOperation,
  sourceOperatorFromKindName,
} from "../../../policy/operations/index.js";
import {
  selectCsharpJsValueUnaryOperation,
} from "../../../policy/js-value-operations/index.js";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../../policy/members/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
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
  const operandNode = input.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredJsValueObjectShapeUpdate(
      node,
      operandNode,
      sourceOperator,
      sourceFile,
      input,
      diagnostics,
    )
  ) {
    return undefined;
  }
  if (sourceOperator !== undefined) {
    const jsValueOperation = selectCsharpJsValueUnaryOperation(
      input,
      operandNode,
      sourceFile,
      sourceOperator,
    );
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
  const selection = selectCsharpUnaryOperation(input, node, sourceFile);
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
  const operandNode = input.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredJsValueObjectShapeUpdate(
      node,
      operandNode,
      sourceOperator,
      sourceFile,
      input,
      diagnostics,
    )
  ) {
    return undefined;
  }
  if (sourceOperator !== undefined) {
    const jsValueOperation = selectCsharpJsValueUnaryOperation(
      input,
      operandNode,
      sourceFile,
      sourceOperator,
    );
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
  const selection = selectCsharpUnaryOperation(input, node, sourceFile);
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
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): boolean {
  if (
    (sourceOperator !== "++" && sourceOperator !== "--") ||
    operand === undefined ||
    !input.ast.is.IsPropertyAccessExpression(operand)
  ) {
    return false;
  }
  const selection = selectCsharpTargetProperty(input, operand, sourceFile);
  if (selection.kind !== "source-owned") {
    return false;
  }
  const jsValueProperty = resolveCsharpJsValueObjectShapeProperty(
    input.objectShapes,
    input.semantics(sourceFile),
    selection,
    sourceFile,
  );
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
