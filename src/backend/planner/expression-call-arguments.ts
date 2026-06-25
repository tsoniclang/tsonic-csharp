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
  sameCsharpType,
} from "./csharp-type-equality.js";
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
  expectedTypeSubject?: Node,
  expectedConversionType?: CsharpTypeNode,
): CsharpArgument {
  const argumentPassing = input.facts.getArgumentPassingFact(node);
  if (argumentPassing === undefined) {
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, expectedConversionType) };
  }
  if (!isAstNode(argumentPassing.targetExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Argument-passing facts must carry AST target expressions before C# argument emission."));
    return { kind: "Argument", expression: planCallArgumentExpression(node, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, expectedConversionType) };
  }
  const passing = getCsharpArgumentPassing(argumentPassing.mode, node, diagnostics);
  return {
    kind: "Argument",
    expression: planCallArgumentExpression(argumentPassing.targetExpression, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, expectedType, expectedTypeSubject, expectedConversionType),
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
  expectedConversionType?: CsharpTypeNode,
): CsharpExpression {
  const conversion = input.facts.getTargetConversionFact(node);
  if (conversion?.operation !== undefined) {
    return planExpression(node, sourceFile, input, diagnostics);
  }
  if (conversion?.convertedType !== undefined) {
    const convertedType = csharpTypeFromTargetTypeRef(conversion.convertedType);
    if (convertedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Selected target argument conversion requires a renderable target type before C# emission."));
      return invalidExpression("target argument conversion type");
    }
    const semanticExpectedType = expectedConversionType ?? expectedType;
    if (semanticExpectedType !== undefined && !sameCsharpType(convertedType, semanticExpectedType)) {
      diagnostics.push({
        ...unsupportedNodeDiagnostic(node, "Selected target argument conversion fact does not match the finalized selected parameter target type."),
        evidence: [
          `convertedTargetType=${JSON.stringify(conversion.convertedType)}`,
          `convertedCsharpType=${JSON.stringify(convertedType)}`,
          `expectedCsharpType=${JSON.stringify(semanticExpectedType)}`,
        ],
      });
      return invalidExpression("target argument conversion mismatch");
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
