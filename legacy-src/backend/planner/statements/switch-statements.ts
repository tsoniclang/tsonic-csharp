import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStatement, CsharpSwitchSection } from "../../target-ast/syntax/index.js";
import type { CsharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { finishSwitchSections, planOrderedSwitch, type CsharpPlannedSwitchSection } from "./ordered-switch.js";

interface SwitchStatementPlanner {
  readonly planExpression: (
    node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  ) => CsharpPlannedValue | undefined;
  readonly planStatements: (
    node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
  ) => readonly CsharpStatement[];
}

export function planSwitchStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): CsharpStatement | undefined {
  const selection = input.program.records.switchStatement.get(node);
  if (selection === undefined || selection.kind === "rejected") {
    return failCsharpPlannerInvariant("An admitted switch lost its selected native classification.", node);
  }
  const ast = input.program.source.ast;
  const body = (clause: Node): readonly CsharpStatement[] => {
    const statements = ast.as.AsCaseOrDefaultClause(clause)?.Statements?.Nodes;
    if (statements === undefined || statements.some(statement => statement === undefined)) {
      failCsharpPlannerInvariant("An admitted switch clause lost its dense source statements.", clause);
    }
    return statements.flatMap(statement => planner.planStatements(statement!, sourceFile, input, diagnostics, state));
  };
  if (selection.kind === "ordered") return planOrderedSwitch(selection, sourceFile, input, diagnostics, state, body);
  const statement = ast.as.AsSwitchStatement(node)!;
  const expression = statement.Expression === undefined ? undefined
    : planner.planExpression(statement.Expression, sourceFile, input, diagnostics);
  if (statement.Expression === undefined || statement.CaseBlock === undefined) {
    failCsharpPlannerInvariant("An admitted switch lost its checked discriminant or case block.", node);
  }
  if (expression === undefined) return undefined;
  const sections: CsharpPlannedSwitchSection[] = [];
  for (const clause of ast.as.AsCaseBlock(statement.CaseBlock)?.Clauses?.Nodes ?? []) {
    if (clause === undefined) failCsharpPlannerInvariant("An admitted switch lost a dense checked clause.", node);
    const exits = input.program.records.statementExit.get(clause);
    if (exits === undefined) failCsharpPlannerInvariant("An admitted switch clause lost its sealed source completion.", clause);
    let label: CsharpSwitchSection["label"];
    if (ast.is.IsDefaultClause(clause)) label = { kind: "DefaultSwitchLabel" };
    else {
      const source = ast.as.AsCaseOrDefaultClause(clause)?.Expression;
      const value = source === undefined ? undefined : planner.planExpression(source, sourceFile, input, diagnostics);
      if (value === undefined) return undefined;
      if (value.prelude.length !== 0 || value.completion.kind !== "value") {
        return failCsharpPlannerInvariant("A native switch case lost its selected constant expression without runtime statements.", clause);
      }
      label = { kind: "CaseSwitchLabel", expression: value.completion.expression };
    }
    sections.push({ exits, syntax: { kind: "SwitchSection", label, statements: body(clause) } });
  }
  return { kind: "Block", body: { kind: "Block", statements: consumeCsharpPlannedValue(expression, value => [{
    kind: "SwitchStatement", expression: value, sections: finishSwitchSections(sections),
  }]) } };
}
