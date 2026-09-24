import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement, CsharpSwitchSection } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { finishSwitchSections, planOrderedSwitch } from "./ordered-switch.js";

interface SwitchStatementPlanner {
  readonly planExpression: (
    node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined;
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
  const selection = input.program.operations.switchStatement(node);
  if (selection === undefined || selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection?.reason ?? "Switch requires sealed C# classification."));
    return undefined;
  }
  const ast = input.program.source.ast;
  const body = (clause: Node) => (ast.as.AsCaseOrDefaultClause(clause)?.Statements?.Nodes ?? [])
    .filter((statement): statement is Node => statement !== undefined)
    .flatMap(statement => planner.planStatements(statement, sourceFile, input, diagnostics, state));
  if (selection.kind === "ordered") return planOrderedSwitch(selection, sourceFile, input, diagnostics, state, body);
  const statement = ast.as.AsSwitchStatement(node)!;
  const expression = statement.Expression === undefined ? undefined
    : planner.planExpression(statement.Expression, sourceFile, input, diagnostics);
  if (expression === undefined || statement.CaseBlock === undefined) return undefined;
  const sections: CsharpSwitchSection[] = [];
  for (const clause of ast.as.AsCaseBlock(statement.CaseBlock)?.Clauses?.Nodes ?? []) {
    if (clause === undefined) continue;
    let label: CsharpSwitchSection["label"];
    if (ast.is.IsDefaultClause(clause)) label = { kind: "DefaultSwitchLabel" };
    else {
      const source = ast.as.AsCaseOrDefaultClause(clause)?.Expression;
      const value = source === undefined ? undefined : planner.planExpression(source, sourceFile, input, diagnostics);
      if (value === undefined) return undefined;
      label = { kind: "CaseSwitchLabel", expression: value };
    }
    sections.push({ kind: "SwitchSection", label, statements: body(clause) });
  }
  return { kind: "SwitchStatement", expression, sections: finishSwitchSections(sections) };
}
