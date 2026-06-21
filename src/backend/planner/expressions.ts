import {
  AsAsExpression,
  AsAwaitExpression,
  AsConditionalExpression,
  AsNonNullExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
  AsStringLiteral,
  AsSatisfiesExpression,
  AsTypeAssertion,
  KindArrowFunction,
  KindAsExpression,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindAwaitExpression,
  KindConditionalExpression,
  KindElementAccessExpression,
  KindFalseKeyword,
  KindFunctionExpression,
  KindIdentifier,
  KindNewExpression,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindParenthesizedExpression,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindRegularExpressionLiteral,
  KindStringLiteral,
  KindSatisfiesExpression,
  KindSuperKeyword,
  KindTemplateExpression,
  KindThisKeyword,
  KindTrueKeyword,
  KindTypeOfExpression,
  KindTypeAssertionExpression,
  Node_Text,
  SourceKind,
  isAstNode,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  planArrayLiteralExpressionFromFacts,
} from "./array-literals.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import { applyTargetConversionFact } from "./target-conversions.js";
import {
  getSourceOwnedUnaryOperator,
  getUnaryOperatorKind,
  planTypeofExpression,
  tryPlanBinaryExpression,
} from "./expression-operators.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import {
  planIdentifierExpression,
} from "./expression-source-references.js";
import {
  planCallExpression,
  planElementAccessExpression,
  planPropertyAccessExpression,
} from "./expression-target-members.js";
import { planExpressionWithExpectedTypeCore } from "./expression-expected-types.js";
import {
  planCallArgumentCore,
} from "./expression-call-arguments.js";
import {
  planNewExpression,
} from "./expression-new.js";
import {
  planTemplateExpression,
} from "./expression-template-strings.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const expression = planExpressionCore(node, sourceFile, input, diagnostics);
  return applyTargetConversionFact(node, input, diagnostics, expression);
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const defaultValue = input.facts.getDefaultValueFact(node);
  if (defaultValue !== undefined) {
    return {
      kind: "DefaultExpression",
      type: isAstNode(defaultValue.type)
        ? getCsharpTypeForNode(defaultValue.type, sourceFile, input, undefined, diagnostics)
        : unsupportedFactExpressionType(node, diagnostics),
    };
  }
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing !== undefined && argumentPassing.targetExpression !== node && isAstNode(argumentPassing.targetExpression)) {
    return planExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics);
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics);
    case KindStringLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsStringLiteral(node)) };
    case KindNoSubstitutionTemplateLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsNoSubstitutionTemplateLiteral(node)) };
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(Node_Text(AsNumericLiteral(node))) };
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTrueKeyword:
      return { kind: "LiteralExpression", value: true };
    case KindFalseKeyword:
      return { kind: "LiteralExpression", value: false };
    case KindNullKeyword:
      return { kind: "LiteralExpression", value: null };
    case KindTypeOfExpression:
      return planTypeofExpression(node, sourceFile, input, diagnostics);
    case KindThisKeyword:
      return { kind: "IdentifierName", name: "this" };
    case KindSuperKeyword:
      return { kind: "IdentifierName", name: "base" };
    case KindAsExpression:
      return planExpression(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindSatisfiesExpression:
      return planExpression(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindNonNullExpression:
      return planExpression(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindTypeAssertionExpression:
      return planExpression(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics);
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)!;
      return {
        kind: "ParenthesizedExpression",
        expression: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrayLiteralExpression: {
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics, {
        planExpression,
        planExpressionWithExpectedType,
      });
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindPropertyAccessExpression:
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindElementAccessExpression:
      return planElementAccessExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression);
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics);
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(node)!;
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return invalidExpression("await without expression");
      }
      return {
        kind: "AwaitExpression",
        expression: planExpression(expression.Expression, sourceFile, input, diagnostics),
      };
    }
    case KindCallExpression:
      return planCallExpression(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, planCallArgument);
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      return {
        kind: "ConditionalExpression",
        condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
        whenTrue: planExpression(expression.WhenTrue!, sourceFile, input, diagnostics),
        whenFalse: planExpression(expression.WhenFalse!, sourceFile, input, diagnostics),
      };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node)!;
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
      if (operator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a selected provider operator fact.", ownership);
        return invalidExpression("missing target prefix operator fact");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target prefix operator");
      }
      return {
        kind: "PrefixUnaryExpression",
        operator,
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
      };
    }
    case KindPostfixUnaryExpression: {
      const expression = AsPostfixUnaryExpression(node)!;
      const selectedOperator = input.facts.getSelectedTargetOperator(node);
      const operator = selectedOperator?.operationKind === "operator"
        ? selectedOperator.targetOperation
        : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
      if (operator === undefined) {
        const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
        pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a selected provider operator fact.", ownership);
        return invalidExpression("missing target postfix operator fact");
      }
      if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
        diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
        return invalidExpression("selected target postfix operator");
      }
      return {
        kind: "PostfixUnaryExpression",
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
        operator,
      };
    }
    default: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, planExpression);
      if (binary !== undefined) {
        return binary;
      }
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return invalidExpression("unsupported expression");
    }
  }
}

export function planCallArgument(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
): CsharpArgument {
  return planCallArgumentCore(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType);
}

export function planExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
): CsharpExpression {
  return planExpressionWithExpectedTypeCore(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, {
    planExpression,
    planExpressionWithExpectedType,
  });
}

function unsupportedFactExpressionType(node: Node, diagnostics: TargetDiagnostic[]): CsharpTypeNode {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Source fact type subject must be an AST type node before C# expression emission."));
  return { kind: "InvalidType", reason: "source fact expression type" };
}
