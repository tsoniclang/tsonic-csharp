import type { ArgumentPassingFact, Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  isAstNode,
  Node_Text,
  SourceKind,
  HasSourceKind,
  KindArrowFunction,
  KindFunctionExpression,
} from "./source-ast.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
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
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression | undefined;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  expectedTargetType?: TargetTypeRef,
) => CsharpExpression | undefined;

export function planCallArgumentCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
): CsharpArgument | undefined {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  if (!isAstNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, conversionExpectedTargetType, state);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  const passing = getCsharpArgumentPassing(argumentPassing.mode, node, diagnostics);
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
  input: TargetCompileInput,
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
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, planExpression, expectedType, state, conversionExpectedTargetType);
    }
    if (HasSourceKind(input.ast, node, KindFunctionExpression)) {
      return planFunctionExpression(node, sourceFile, input, diagnostics, expectedType, state, conversionExpectedTargetType);
    }
  }
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion?.operation !== undefined) {
    return planExpression(node, sourceFile, input, diagnostics);
  }
  if (conversion?.convertedType !== undefined) {
    const convertedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (convertedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return undefined;
    }
    if (conversionExpectedTargetType !== undefined && !targetTypeRefEquals(conversion.convertedType, conversionExpectedTargetType)) {
      diagnostics.push(unsupportedNodeDiagnostic(node, `Selected target argument conversion fact does not match the selected call parameter type. Node: ${SourceKind(input.ast, node)} '${Node_Text(node)}'. Conversion target: ${targetTypeRefKey(conversion.convertedType)}. Selected parameter target: ${targetTypeRefKey(conversionExpectedTargetType)}.`));
      return undefined;
    }
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType ?? convertedType, expectedTypeSubject);
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject);
  }
  return planExpression(node, sourceFile, input, diagnostics);
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
