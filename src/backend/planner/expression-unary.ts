import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpUnaryOperation,
  sourceOperatorFromKindName,
} from "../../policy/operations/index.js";
import {
  selectCsharpCompatAnyUnaryOperation,
} from "../../policy/compat/index.js";
import {
  resolveCsharpCompatObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  csharpPostfixUnaryOperatorTokenFromText,
  csharpPrefixUnaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  translateCsharpCompatInvocation,
} from "../../translate/expressions/compat.js";

export function planPrefixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operandNode = input.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredCompatObjectShapeUpdate(
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
    const compat = selectCsharpCompatAnyUnaryOperation(
      input,
      operandNode,
      sourceFile,
      sourceOperator,
    );
    if (compat.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
      return undefined;
    }
    if (compat.kind === "resolved") {
      const operand = operandNode === undefined
        ? undefined
        : planExpression(operandNode, sourceFile, input, diagnostics);
      return operand === undefined
        ? undefined
        : translateCsharpCompatInvocation(
            compat,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operandNode = input.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    rejectUnloweredCompatObjectShapeUpdate(
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
    const compat = selectCsharpCompatAnyUnaryOperation(
      input,
      operandNode,
      sourceFile,
      sourceOperator,
    );
    if (compat.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
      return undefined;
    }
    if (compat.kind === "resolved") {
      const operand = operandNode === undefined
        ? undefined
        : planExpression(operandNode, sourceFile, input, diagnostics);
      return operand === undefined
        ? undefined
        : translateCsharpCompatInvocation(
            compat,
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

function rejectUnloweredCompatObjectShapeUpdate(
  node: Node,
  operand: Node | undefined,
  sourceOperator: string | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  const compatProperty = resolveCsharpCompatObjectShapeProperty(
    input.objectShapes,
    input.semantics(sourceFile),
    selection,
    sourceFile,
  );
  if (compatProperty.kind === "not-compat-object-shape") {
    return false;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    node,
    compatProperty.kind === "rejected"
      ? compatProperty.reason
      : `Closed compatibility object-shape update '${sourceOperator}' requires an exact writable-location translation; emitting a read expression as a C# location is forbidden.`,
  ));
  return true;
}
