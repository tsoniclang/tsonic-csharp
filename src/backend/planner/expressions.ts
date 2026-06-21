import {
  KindArrowFunction,
  KindCallExpression,
  KindArrayLiteralExpression,
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
  const sourceSyntax = tryPlanSourceSyntaxExpression(node, sourceFile, input, diagnostics, planExpression);
  if (sourceSyntax !== undefined) {
    return sourceSyntax;
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics);
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTypeOfExpression:
      return planTypeofExpression(node, sourceFile, input, diagnostics);
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
    case KindCallExpression:
      return planCallExpression(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, planCallArgument);
    case KindPrefixUnaryExpression: {
      return planPrefixUnaryExpression(node, sourceFile, input, diagnostics, planExpression);
    }
    case KindPostfixUnaryExpression: {
      return planPostfixUnaryExpression(node, sourceFile, input, diagnostics, planExpression);
    }
    case KindBinaryExpression: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, planExpression);
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
