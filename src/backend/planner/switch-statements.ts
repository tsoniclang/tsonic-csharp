import {
  AsCaseBlock,
  AsCaseOrDefaultClause,
  AsSwitchStatement,
  HasSourceKind,
  KindDefaultClause,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement, CsharpSwitchSection } from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";

interface SwitchStatementPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression;
  readonly planStatements: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
    state: DestructuringPlannerState,
  ) => readonly CsharpStatement[];
}

export function planSwitchStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): CsharpStatement {
  const statement = AsSwitchStatement(node)!;
  return {
    kind: "SwitchStatement",
    expression: planner.planExpression(statement.Expression!, sourceFile, input, diagnostics),
    sections: planSwitchSections(statement.CaseBlock, sourceFile, input, diagnostics, state, planner),
  };
}

function planSwitchSections(
  caseBlockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): readonly CsharpSwitchSection[] {
  if (caseBlockNode === undefined) {
    return [];
  }
  const caseBlock = AsCaseBlock(caseBlockNode)!;
  const sections = (caseBlock.Clauses?.Nodes ?? [])
    .filter((clause): clause is Node => clause !== undefined)
    .map((clause) => planSwitchSection(clause, sourceFile, input, diagnostics, state, planner));
  return sections.map((section, index) => {
    const last = section.statements[section.statements.length - 1];
    const next = sections[index + 1];
    if (next !== undefined && (last === undefined || !statementTerminatesSwitchSection(last))) {
      return {
        ...section,
        statements: [
          ...section.statements,
          { kind: "GotoSwitchStatement" as const, label: next.label },
        ],
      };
    }
    if (next === undefined && (last === undefined || !statementTerminatesSwitchSection(last))) {
      return {
        ...section,
        statements: [
          ...section.statements,
          { kind: "BreakStatement" as const },
        ],
      };
    }
    return section;
  });
}

function planSwitchSection(
  clauseNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): CsharpSwitchSection {
  const clause = AsCaseOrDefaultClause(clauseNode)!;
  return {
    kind: "SwitchSection",
    label: HasSourceKind(input.ast, clauseNode, KindDefaultClause)
      ? { kind: "DefaultSwitchLabel" }
      : { kind: "CaseSwitchLabel", expression: planner.planExpression(clause.Expression!, sourceFile, input, diagnostics) },
    statements: (clause.Statements?.Nodes ?? [])
      .filter((statement): statement is Node => statement !== undefined)
      .flatMap((statement) => planner.planStatements(statement, sourceFile, input, diagnostics, state)),
  };
}

function statementTerminatesSwitchSection(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "BreakStatement":
    case "ContinueStatement":
    case "GotoStatement":
    case "GotoSwitchStatement":
    case "ReturnStatement":
    case "ThrowStatement":
      return true;
    case "Block": {
      const last = statement.body.statements[statement.body.statements.length - 1];
      return last !== undefined && statementTerminatesSwitchSection(last);
    }
    default:
      return false;
  }
}
