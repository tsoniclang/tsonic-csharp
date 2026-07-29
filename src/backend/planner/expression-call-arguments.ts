import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  argumentPassingFactKey,
  type ArgumentPassingFact,
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  isAstNode,
  HasSourceKind,
  KindArrowFunction,
  KindFunctionExpression,
} from "./source-ast.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression | undefined;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  expectedTargetType?: TargetTypeRef,
) => CsharpExpression | undefined;

export function planCallArgumentCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  expectedArgumentPassingMode: ArgumentPassingFact["mode"] = "by-value",
  state?: DestructuringPlannerState,
): CsharpArgument | undefined {
  const argumentPassing = input.sourceFacts?.getFact(node, argumentPassingFactKey);
  if (argumentPassing === undefined) {
    if (expectedArgumentPassingMode !== "by-value") {
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission requires finalized argument-passing facts for selected ${expectedArgumentPassingMode} parameters.`));
      return undefined;
    }
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  if (!csharpSupportsArgumentPassingMode(argumentPassing.mode)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${argumentPassing.mode}'.`));
    return undefined;
  }
  if (argumentPassing.mode !== expectedArgumentPassingMode) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Finalized argument-passing fact '${argumentPassing.mode}' does not match the selected call parameter mode '${expectedArgumentPassingMode}'.`));
    return undefined;
  }
  if (!isAstNode(input.ast, argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return undefined;
  }
  const passing = getCsharpArgumentPassing(argumentPassing.mode, node, diagnostics);
  if (argumentPassing.mode !== "by-value" && passing === undefined) {
    return undefined;
  }
  const expression = planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
  if (expression === undefined) {
    return undefined;
  }
  return {
    kind: "Argument",
    expression,
    ...(passing !== undefined ? { passing } : {}),
  };
}

function planCallArgumentExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (expectedType !== undefined && conversionExpectedTargetType !== undefined) {
    if (HasSourceKind(input.ast, node, KindArrowFunction)) {
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression, expectedType, state, conversionExpectedTargetType, planExpressionWithExpectedType);
    }
    if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
      return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, state, conversionExpectedTargetType);
    }
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType);
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

function csharpSupportsArgumentPassingMode(
  mode: ArgumentPassingFact["mode"],
): boolean {
  switch (mode) {
    case "by-value":
    case "byref-writeonly-must-init":
    case "byref-readwrite":
    case "byref-readonly":
      return true;
    case "borrow-shared":
    case "borrow-mut":
    case "move":
      return false;
  }
}

function getCsharpArgumentPassing(
  mode: ArgumentPassingFact["mode"],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpArgument["passing"] {
  switch (mode) {
    case "by-value":
      return undefined;
    case "byref-writeonly-must-init":
      return "out";
    case "byref-readwrite":
      return "ref";
    case "byref-readonly":
      return "in";
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, `C# argument emission does not support finalized argument-passing mode '${mode}'.`));
      return undefined;
  }
}
