import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  KindArrowFunction,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindDeleteExpression,
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
  KindVoidExpression,
  SourceKind,
} from "./source-ast.js";
import {
  argumentPassingFactKey,
  defaultValueFactKey,
  type ArgumentPassingFact,
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  sourceNodesEqual,
} from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";
import {
  planArrayLiteralExpressionFromFacts,
} from "./array-literals/index.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
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
} from "./expression-target-members/index.js";
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
  planVoidExpression,
} from "./expression-void.js";
import {
  planPostfixUnaryExpression,
  planPrefixUnaryExpression,
} from "./expression-unary.js";
import {
  tryPlanJsArrayDeleteExpression,
} from "./expression-js-array-mutations.js";
import {
  tryPlanSourceSyntaxExpression,
} from "./expression-source-syntax.js";
import {
  tryPlanDestructuringAssignmentExpression,
} from "./destructuring-assignment.js";
import {
  selectCsharpExpressionConversion,
} from "../../policy/conversions/index.js";
import {
  applyCsharpConversionSelection,
} from "../../translate/expressions/conversions.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  return planExpressionCore(node, sourceFile, input, diagnostics, state);
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const defaultValue = input.sourceFacts?.getFact(node, defaultValueFactKey);
  if (defaultValue !== undefined) {
    return {
      kind: "DefaultExpression",
      nullForgiving: true,
      type: getCsharpTypeForNode(
        defaultValue.type,
        sourceFile,
        input,
        undefined,
        diagnostics,
      ),
    };
  }
  const argumentPassing = input.sourceFacts?.getFact(node, argumentPassingFactKey);
  if (
    argumentPassing?.storageExpression !== undefined &&
    !sourceNodesEqual(input.ast, argumentPassing.storageExpression, node)
  ) {
    return planExpression(argumentPassing.storageExpression, sourceFile, input, diagnostics, state);
  }
  const scopedPlanExpression = (
    expressionNode: Node,
    expressionSourceFile: SourceFile,
    expressionInput: CsharpTranslationContext,
    expressionDiagnostics: TargetDiagnostic[],
  ): CsharpExpression | undefined => planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state);
  const scopedPlanCallArgument = (
    argumentNode: Node,
    argumentSourceFile: SourceFile,
    argumentInput: CsharpTranslationContext,
    argumentDiagnostics: TargetDiagnostic[],
    expectedType?: CsharpTypeNode,
    expectedTypeSubject?: Node,
    conversionExpectedTargetType?: TargetTypeRef,
    expectedArgumentPassingMode?: ArgumentPassingFact["mode"],
  ): CsharpArgument | undefined => planCallArgument(
    argumentNode,
    argumentSourceFile,
    argumentInput,
    argumentDiagnostics,
    expectedType,
    expectedTypeSubject,
    conversionExpectedTargetType,
    state,
    expectedArgumentPassingMode,
  );
  const sourceSyntaxDiagnosticsStart = diagnostics.length;
  const sourceSyntax = tryPlanSourceSyntaxExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
  if (sourceSyntax !== undefined) {
    return sourceSyntax;
  }
  if (diagnostics.length > sourceSyntaxDiagnosticsStart) {
    return undefined;
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics, state);
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTypeOfExpression:
      return planTypeofExpression(node, sourceFile, input, diagnostics);
    case KindVoidExpression:
      return planVoidExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindDeleteExpression:
      return tryPlanJsArrayDeleteExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        scopedPlanCallArgument,
      );
    case KindArrayLiteralExpression: {
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics, {
        planExpression: (element, elementSourceFile, elementInput, elementDiagnostics) =>
          planExpression(element, elementSourceFile, elementInput, elementDiagnostics, state),
        planExpressionWithExpectedType: (element, elementSourceFile, elementInput, elementDiagnostics, expectedType, expectedTypeSubject, expectedTargetType) =>
          planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, expectedType, expectedTypeSubject, state, expectedTargetType),
      });
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return undefined;
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindPropertyAccessExpression:
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindElementAccessExpression:
      return planElementAccessExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        (
          argumentNode,
          argumentSourceFile,
          argumentInput,
          argumentDiagnostics,
          expectedType,
          expectedTypeSubject,
          conversionExpectedTargetType,
          expectedArgumentPassingMode,
        ) =>
          planCallArgument(
            argumentNode,
            argumentSourceFile,
            argumentInput,
            argumentDiagnostics,
            expectedType,
            expectedTypeSubject,
            conversionExpectedTargetType,
            state,
            expectedArgumentPassingMode,
          ),
      );
    case KindArrowFunction:
      return planArrowFunctionExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        undefined,
        state,
        undefined,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, expectedTargetType) =>
          planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, state, expectedTargetType),
      );
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
        (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, expectedArgumentPassingMode) =>
          planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, state, expectedArgumentPassingMode),
      );
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, expectedArgumentPassingMode) =>
        planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, state, expectedArgumentPassingMode));
    case KindPrefixUnaryExpression: {
      return planPrefixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindPostfixUnaryExpression: {
      return planPostfixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindBinaryExpression: {
      const destructuringAssignment = tryPlanDestructuringAssignmentExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        state,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState) =>
          planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState ?? state),
      );
      if (destructuringAssignment !== undefined) {
        return destructuringAssignment;
      }
      if (diagnostics.length > sourceSyntaxDiagnosticsStart) {
        return undefined;
      }
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
        planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state), scopedPlanCallArgument);
      return binary;
    }
    default: {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return undefined;
    }
  }
}

export function planCallArgument(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
  expectedArgumentPassingMode?: ArgumentPassingFact["mode"],
): CsharpArgument | undefined {
  return planCallArgumentCore(
    node,
    sourceFile,
    input,
    diagnostics,
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedExpectedTargetType) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, state, nestedExpectedTargetType),
    expectedType,
    expectedTypeSubject,
    conversionExpectedTargetType,
    expectedArgumentPassingMode,
    state,
  );
}

export function planExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const expression = planExpressionWithExpectedTypeCore(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, {
    planExpression: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
    planExpressionWithExpectedType: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject, nestedExpectedTargetType) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject, state, nestedExpectedTargetType),
  }, expectedTargetType);
  if (expression === undefined || expectedTargetType === undefined) {
    return expression;
  }
  if (expressionIsConstructedInExpectedRepresentation(input, node)) {
    return expression;
  }
  const sourceType = input.types.resolveNode(node, sourceFile);
  const selection = selectCsharpExpressionConversion(
    input,
    node,
    sourceType,
    expectedTargetType,
    "implicit",
  );
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceType,
    expectedTargetType,
    selection,
    expression,
  );
}

function expressionIsConstructedInExpectedRepresentation(
  input: CsharpTranslationContext,
  node: Node,
): boolean {
  switch (SourceKind(input.ast, node)) {
    case KindArrayLiteralExpression:
    case KindObjectLiteralExpression:
    case KindArrowFunction:
    case KindFunctionExpression:
      return true;
    default:
      return false;
  }
}
