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
) => CsharpExpression | undefined;

export type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
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
): CsharpArgument | undefined {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  if (!isAstNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    const expression = planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject);
    return expression === undefined ? undefined : { kind: "Argument", expression };
  }
  const passing = getCsharpArgumentPassing(argumentPassing.mode, node, diagnostics);
  const expression = planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject);
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
): CsharpExpression | undefined {
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
