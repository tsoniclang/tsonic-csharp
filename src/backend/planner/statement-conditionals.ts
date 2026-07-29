import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsDoStatement,
  AsIfStatement,
  AsWhileStatement,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
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
  planCsharpConditionExpression as planCheckedConditionExpression,
} from "./expression-bool-carriers.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";

export function planIfStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(sourceFile, `${statementKind} requires a condition expression.`));
    return undefined;
  }
  return planCheckedConditionExpression(
    expression,
    `${statementKind} condition`,
    sourceFile,
    input,
    diagnostics,
    (condition, conditionSourceFile, conditionInput, conditionDiagnostics) =>
      planExpression(
        condition,
        conditionSourceFile,
        conditionInput,
        conditionDiagnostics,
        state,
      ),
  );
}
