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
  CsharpTypeNode,
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
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
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
  if (!hasBooleanConditionCarrier(expression, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, `${statementKind} condition requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission.`));
    return undefined;
  }
  return planExpression(expression, sourceFile, input, diagnostics, state);
}

function hasBooleanConditionCarrier(
  expression: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (HasSourceKind(input.ast, expression, KindTrueKeyword) || HasSourceKind(input.ast, expression, KindFalseKeyword)) {
    return true;
  }
  const carrier = getRuntimeCarrierForExpression(input, expression, sourceFile);
  return carrier === undefined ? false : isCsharpBoolType(csharpTypeFromTargetTypeRef(carrier));
}

function isCsharpBoolType(type: CsharpTypeNode | undefined): boolean {
  return type?.kind === "PredefinedType" && type.name === "bool";
}
