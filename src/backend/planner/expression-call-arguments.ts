import type { ArgumentPassingFact, Node, SourceFile } from "@tsonic/tsts";
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
  invalidExpression,
} from "./invalid-expression.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  isAstNode,
} from "./source-ast.js";

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
) => CsharpExpression;

export function planCallArgumentCore(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType?: CsharpTypeNode,
): CsharpArgument {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType) };
  }
  if (!isAstNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType) };
  }
  return {
    kind: "Argument",
    expression: planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType),
    passing: getCsharpArgumentPassing(argumentPassing.mode),
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
): CsharpExpression {
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion?.operation !== undefined) {
    return planExpression(node, sourceFile, input, diagnostics);
  }
  if (expectedType !== undefined) {
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, expectedType);
  }
  if (conversion?.convertedType !== undefined) {
    const convertedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (convertedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return invalidExpression("target argument conversion type");
    }
    return planExpressionWithExpectedType(node, sourceFile, input, diagnostics, convertedType);
  }
  return planExpression(node, sourceFile, input, diagnostics);
}

function getCsharpArgumentPassing(mode: ArgumentPassingFact["mode"]): CsharpArgument["passing"] {
  switch (mode) {
    case "byref-writeonly-must-init":
      return "out";
    case "byref-readwrite":
      return "ref";
    case "byref-readonly":
      return "in";
    default:
      return undefined;
  }
}
