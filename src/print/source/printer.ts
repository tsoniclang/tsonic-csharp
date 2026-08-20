import type {
  CsharpCompilationUnit,
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../backend/target-ast/roslyn/index.js";
import {
  printCsharpArgument as printCsharpArgumentWithContext,
  printCsharpAttributes as printCsharpAttributesWithContext,
  printCsharpParameter as printCsharpParameterWithContext,
  printTypeParameterConstraintLines as printTypeParameterConstraintLinesWithContext,
  printTypeParameterConstraintSuffix as printTypeParameterConstraintSuffixWithContext,
  printTypeParameters,
} from "./common.js";
import type { CsharpPrintContext } from "./context.js";
import { printCsharpCompilationUnit as printCsharpCompilationUnitWithContext } from "./declarations.js";
import { printCsharpExpression as printCsharpExpressionWithContext } from "./expressions.js";
import {
  printCsharpStatement as printCsharpStatementWithContext,
  printCsharpStatements as printCsharpStatementsWithContext,
} from "./statements.js";
import { printCsharpType as printCsharpTypeImpl } from "./types.js";

const defaultContext: CsharpPrintContext = {
  printArgument: (argument) => printCsharpArgumentWithContext(argument, defaultContext),
  printAttributes: (attributes) => printCsharpAttributesWithContext(attributes, defaultContext),
  printExpression: (expression) => printCsharpExpressionWithContext(expression, defaultContext),
  printParameter: (parameter) => printCsharpParameterWithContext(parameter, defaultContext),
  printStatement: (statement) => printCsharpStatementWithContext(statement, defaultContext),
  printStatements: (statements) => printCsharpStatementsWithContext(statements, defaultContext),
  printType: printCsharpTypeImpl,
  printTypeParameterConstraintLines: (typeParameters) =>
    printTypeParameterConstraintLinesWithContext(typeParameters, defaultContext),
  printTypeParameterConstraintSuffix: (typeParameters) =>
    printTypeParameterConstraintSuffixWithContext(typeParameters, defaultContext),
  printTypeParameters,
};

export function printCsharpCompilationUnit(unit: CsharpCompilationUnit): string {
  return printCsharpCompilationUnitWithContext(unit, defaultContext);
}

export function printCsharpExpression(expression: CsharpExpression): string {
  return printCsharpExpressionWithContext(expression, defaultContext);
}

export function printCsharpStatement(statement: CsharpStatement): string {
  return printCsharpStatementWithContext(statement, defaultContext);
}

export function printCsharpType(type: CsharpTypeNode): string {
  return printCsharpTypeImpl(type);
}
