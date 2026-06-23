import {
  KindArrowFunction,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindAsExpression,
  KindBinaryExpression,
  KindElementAccessExpression,
  KindFunctionExpression,
  KindIdentifier,
  KindNewExpression,
  KindObjectLiteralExpression,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindRegularExpressionLiteral,
  KindTemplateExpression,
  KindTypeOfExpression,
  KindTypeAssertionExpression,
  SourceKind,
  isAstNode,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";
import {
  planArrayLiteralExpressionFromFacts,
} from "./array-literals.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import { applyTargetConversionFact } from "./target-conversions.js";
import {
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
import {
  planPostfixUnaryExpression,
  planPrefixUnaryExpression,
} from "./expression-unary.js";
import {
  tryPlanSourceSyntaxExpression,
} from "./expression-source-syntax.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression {
  const expression = planExpressionCore(node, sourceFile, input, diagnostics, state);
  return applyTargetConversionFact(node, input, diagnostics, expression);
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
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
    return planExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, state);
  }
  const scopedPlanExpression = (
    expressionNode: Node,
    expressionSourceFile: SourceFile,
    expressionInput: TargetCompileInput,
    expressionDiagnostics: TargetDiagnostic[],
  ): CsharpExpression => planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state);
  const sourceSyntax = tryPlanSourceSyntaxExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
  if (sourceSyntax !== undefined) {
    return sourceSyntax;
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics, state);
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTypeOfExpression:
      return planTypeofExpression(node, sourceFile, input, diagnostics);
    case KindArrayLiteralExpression: {
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics, {
        planExpression: (element, elementSourceFile, elementInput, elementDiagnostics) =>
          planExpression(element, elementSourceFile, elementInput, elementDiagnostics, state),
        planExpressionWithExpectedType: (element, elementSourceFile, elementInput, elementDiagnostics, expectedType) =>
          planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, expectedType, undefined, state),
      });
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return invalidExpression("object literal without target type");
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindPropertyAccessExpression:
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindElementAccessExpression:
      return planElementAccessExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
        planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state), undefined, state);
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics, undefined, state);
    case KindCallExpression:
      return planCallExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject) =>
          planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, state),
      );
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType) =>
        planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, undefined, state));
    case KindPrefixUnaryExpression: {
      return planPrefixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindPostfixUnaryExpression: {
      return planPostfixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindBinaryExpression: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
        planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state));
      return binary ?? invalidExpression("unsupported binary expression");
    }
    default: {
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
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
): CsharpArgument {
  return planCallArgumentCore(
    node,
    sourceFile,
    input,
    diagnostics,
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, state),
    expectedType,
    expectedTypeSubject,
  );
}

export function planExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
): CsharpExpression {
  const expression = planExpressionWithExpectedTypeCore(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, {
    planExpression: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
    planExpressionWithExpectedType: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject, state),
  });
  const kind = SourceKind(input.ast, node);
  return kind === KindAsExpression || kind === KindTypeAssertionExpression
    ? applyTargetConversionFact(node, input, diagnostics, expression)
    : expression;
}

function unsupportedFactExpressionType(node: Node, diagnostics: TargetDiagnostic[]): CsharpTypeNode {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Source fact type subject must be an AST type node before C# expression emission."));
  return { kind: "InvalidType", reason: "source fact expression type" };
}
