import type { CsharpPlanningContext } from "../context.js";
import {
  AsLabeledStatement,
  HasSourceKind,
  KindDoStatement,
  KindForInStatement,
  KindForOfStatement,
  KindForStatement,
  KindWhileStatement,
  Node_Text,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStatement } from "../../target-ast/roslyn/index.js";
import {
  allocateControlLabel,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";

export type NestedStatementBodyPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function planLabeledStatement(
  statement: NonNullable<ReturnType<typeof AsLabeledStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementBodyPlanner,
): CsharpStatement {
  const sourceName = requireCsharpIdentifier(Node_Text(input.program.source.ast, statement.Label!), diagnostics, "Statement label");
  const target = {
    sourceName,
    breakLabel: allocateControlLabel(state, sourceName, "BreakStatement"),
    ...(isIterationStatement(statement.Statement, input)
      ? { continueLabel: allocateControlLabel(state, sourceName, "ContinueStatement") }
      : {}),
  };
  state.controlLabels.push(target);
  const planned = planSingleStatement(statement.Statement, sourceFile, input, diagnostics, state, planNestedStatementBody);
  state.controlLabels.pop();
  const loweredStatement = target.continueLabel === undefined
    ? planned
    : attachContinueLabel(planned, target.continueLabel);
  return {
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LabeledStatement",
          name: sourceName,
          statement: loweredStatement,
        },
        controlLabelStatement(target.breakLabel),
      ],
    },
  };
}

export function findControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
): { readonly breakLabel: string; readonly continueLabel?: string } | undefined {
  const sanitized = sourceName;
  for (let index = state.controlLabels.length - 1; index >= 0; index--) {
    const target = state.controlLabels[index]!;
    if (target.sourceName === sanitized) {
      return target;
    }
  }
  return undefined;
}

function planSingleStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementBodyPlanner,
): CsharpStatement {
  const statements = planNestedStatementBody(node, sourceFile, input, diagnostics, state);
  if (statements.length === 1) {
    return statements[0]!;
  }
  return {
    kind: "Block",
    body: { kind: "Block", statements },
  };
}

function isIterationStatement(node: Node | undefined, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, node, KindWhileStatement) ||
    HasSourceKind(input.program.source.ast, node, KindDoStatement) ||
    HasSourceKind(input.program.source.ast, node, KindForStatement) ||
    HasSourceKind(input.program.source.ast, node, KindForInStatement) ||
    HasSourceKind(input.program.source.ast, node, KindForOfStatement);
}

function attachContinueLabel(statement: CsharpStatement, label: string): CsharpStatement {
  switch (statement.kind) {
    case "WhileStatement":
    case "DoStatement":
    case "ForStatement":
    case "ForEachStatement":
      return {
        ...statement,
        body: {
          kind: "Block",
          statements: [
            ...statement.body.statements,
            controlLabelStatement(label),
          ],
        },
      };
    case "Block": {
      const lastIndex = statement.body.statements.length - 1;
      const last = statement.body.statements[lastIndex];
      if (last !== undefined) {
        return {
          kind: "Block",
          body: {
            kind: "Block",
            statements: statement.body.statements.map((child, index) =>
              index === lastIndex ? attachContinueLabel(child, label) : child),
          },
        };
      }
      return statement;
    }
    default:
      return statement;
  }
}

function controlLabelStatement(label: string): CsharpStatement {
  return {
    kind: "LabeledStatement",
    name: label,
    statement: {
      kind: "Block",
      body: { kind: "Block", statements: [] },
    },
  };
}
