import {
  AsDoStatement,
  AsIfStatement,
  AsWhileStatement,
  HasSourceKind,
  KindFalseKeyword,
  KindTrueKeyword,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  planExpression,
} from "./expressions.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  requireCsharpBoolRuntimeCarrier,
} from "./expression-bool-carriers.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";

export function planIfStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsIfStatement(node)!;
  const condition = planConditionExpression(statement.Expression, "If statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  return [{
    kind: "IfStatement",
    condition,
    thenBody: {
      kind: "Block",
      statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics, state),
    },
    ...(statement.ElseStatement !== undefined
      ? { elseBody: { kind: "Block", statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics, state) } }
      : {}),
  }];
}

export function planWhileStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsWhileStatement(node)!;
  const condition = planConditionExpression(statement.Expression, "While statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  return [{
    kind: "WhileStatement",
    condition,
    body: {
      kind: "Block",
      statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
    },
  }];
}

export function planDoStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsDoStatement(node)!;
  const condition = planConditionExpression(statement.Expression, "Do statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  return [{
    kind: "DoStatement",
    body: {
      kind: "Block",
      statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
    },
    condition,
  }];
}

export function planConditionExpression(
  expression: Node | undefined,
  statementKind: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(sourceFile, `${statementKind} requires a condition expression.`));
    return undefined;
  }
  if (HasSourceKind(input.ast, expression, KindTrueKeyword) || HasSourceKind(input.ast, expression, KindFalseKeyword)) {
    return planExpression(expression, sourceFile, input, diagnostics, state);
  }
  if (!requireCsharpBoolRuntimeCarrier(expression, `${statementKind} condition`, sourceFile, input, diagnostics)) {
    return undefined;
  }
  return planExpression(expression, sourceFile, input, diagnostics, state);
}
