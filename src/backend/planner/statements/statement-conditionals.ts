import type { CsharpPlanningContext } from "../context.js";
import {
  AsDoStatement,
  AsIfStatement,
  AsWhileStatement,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planExpression,
} from "../expressions/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  planCsharpConditionExpression as planCheckedConditionExpression,
} from "../expressions/expression-bool-carriers.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
import { planCsharpLoopContinuation, csharpLoopContinuationLabel } from "./loop-regions.js";

export function planIfStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsIfStatement(input.program.source.ast, node)!;
  const selected = statement.Expression === undefined ? undefined : input.program.operations.nativeGuardResult(statement.Expression);
  if (selected !== undefined) {
    const branch = selected ? statement.ThenStatement : statement.ElseStatement;
    return branch === undefined ? [] : [{ kind: "Block", body: { kind: "Block",
      statements: planNestedStatementBody(branch, sourceFile, input, diagnostics, state) } }];
  }
  const condition = planConditionExpression(statement.Expression, "If statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(condition, value => [{
    kind: "IfStatement",
    condition: value,
    thenBody: {
      kind: "Block",
      statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics, state),
    },
    ...(statement.ElseStatement !== undefined
      ? { elseBody: { kind: "Block", statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics, state) } }
      : {}),
  }]);
}

export function planWhileStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsWhileStatement(input.program.source.ast, node)!;
  const condition = planConditionExpression(statement.Expression, "While statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  if (condition.completion.kind !== "value") return condition.prelude;
  const body = planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state);
  return [{
    kind: "WhileStatement",
    condition: condition.prelude.length === 0 ? condition.completion.expression : { kind: "LiteralExpression", value: true },
    body: {
      kind: "Block",
      statements: [...(condition.prelude.length === 0 ? [] : [...condition.prelude, {
        kind: "IfStatement" as const, condition: { kind: "PrefixUnaryExpression" as const,
          operatorToken: { kind: "ExclamationToken" as const }, operand: { kind: "ParenthesizedExpression" as const, expression: condition.completion.expression } },
        thenBody: { kind: "Block" as const, statements: [{ kind: "BreakStatement" as const }] },
      }]), ...body],
    },
  }];
}

export function planDoStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsDoStatement(input.program.source.ast, node)!;
  const condition = planConditionExpression(statement.Expression, "Do statement", sourceFile, input, diagnostics, state);
  if (condition === undefined) {
    return [];
  }
  const label = condition.prelude.length === 0 ? undefined : planCsharpLoopContinuation(node, state);
  const body = planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state);
  if (condition.completion.kind !== "value") return [{ kind: "WhileStatement", condition: { kind: "LiteralExpression", value: true },
    body: { kind: "Block", statements: [{ kind: "Block", body: { kind: "Block", statements: body } }, ...(label === undefined ? [] : csharpLoopContinuationLabel(node, label, state)), ...condition.prelude] } }];
  if (label !== undefined) return [{ kind: "WhileStatement", condition: { kind: "LiteralExpression", value: true },
    body: { kind: "Block", statements: [{ kind: "Block", body: { kind: "Block", statements: body } }, ...csharpLoopContinuationLabel(node, label, state), ...condition.prelude, {
      kind: "IfStatement", condition: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" },
        operand: { kind: "ParenthesizedExpression", expression: condition.completion.expression } },
      thenBody: { kind: "Block", statements: [{ kind: "BreakStatement" }] },
    }] } }];
  return [{
    kind: "DoStatement",
    body: {
      kind: "Block",
      statements: body,
    },
    condition: condition.completion.expression,
  }];
}

export function planConditionExpression(
  expression: Node | undefined,
  statementKind: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
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
