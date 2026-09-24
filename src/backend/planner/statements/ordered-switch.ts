import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSwitchSelection } from "../../../analysis/operations/index.js";
import type { CsharpExpression, CsharpStatement, CsharpSwitchSection } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { planExpression, planExpressionWithExpectedType } from "../expressions/index.js";
import { planSelectedCsharpBinaryOperation } from "../expressions/operators/selected-binary.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function planOrderedSwitch(
  selection: Extract<CsharpSwitchSelection, { readonly kind: "ordered" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBody: (node: Node) => readonly CsharpStatement[],
): CsharpStatement | undefined {
  const expression = planExpression(selection.expression, sourceFile, input, diagnostics, state);
  const type = csharpTypeFromTargetTypeRef(selection.type);
  if (expression === undefined || type === undefined) return undefined;
  const valueName = allocateExpressionTemp(state);
  const sectionName = allocateExpressionTemp(state);
  const value: CsharpExpression = { kind: "IdentifierName", name: valueName };
  const section: CsharpExpression = { kind: "IdentifierName", name: sectionName };
  const previous = state.expressionOverrides.get(selection.expression);
  state.expressionOverrides.set(selection.expression, value);
  const tests: { readonly index: number; readonly condition: CsharpExpression }[] = [];
  try {
    for (const [index, clause] of selection.clauses.entries()) {
      if (clause.comparison === undefined) continue;
      const condition = planSelectedCsharpBinaryOperation(clause.node, clause.comparison,
        sourceFile, input, diagnostics,
        (node, file, context, reports) => planExpression(node, file, context, reports, state),
        (node, file, context, reports, expected, subject, target) =>
          planExpressionWithExpectedType(node, file, context, reports, expected, subject, state, target), state);
      if (condition === undefined) return undefined;
      tests.push({ index, condition });
    }
  } finally {
    if (previous === undefined) state.expressionOverrides.delete(selection.expression);
    else state.expressionOverrides.set(selection.expression, previous);
  }
  let branch: CsharpStatement | undefined;
  for (let position = tests.length - 1; position >= 0; position--) {
    const { index, condition } = tests[position]!;
    branch = { kind: "IfStatement", condition, thenBody: { kind: "Block", statements: [{
      kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: section,
        operatorToken: { kind: "EqualsToken" }, right: { kind: "LiteralExpression", value: index } },
    }] }, ...(branch === undefined ? {} : { elseBody: { kind: "Block" as const, statements: [branch] } }) };
  }
  const sections = selection.clauses.map((clause, index) => ({
    kind: "SwitchSection" as const,
    label: { kind: "CaseSwitchLabel" as const, expression: { kind: "LiteralExpression" as const, value: index } },
    statements: planBody(clause.node),
  }));
  return { kind: "Block", body: { kind: "Block", statements: [
    { kind: "LocalDeclarationStatement", name: valueName, type, initializer: expression },
    { kind: "LocalDeclarationStatement", name: sectionName, type: { kind: "PredefinedType", name: "int" },
      initializer: { kind: "LiteralExpression", value: selection.defaultIndex } },
    ...(branch === undefined ? [] : [branch]),
    { kind: "SwitchStatement", expression: section, sections: finishSwitchSections(sections) },
  ] } };
}

export function finishSwitchSections(sections: readonly CsharpSwitchSection[]) {
  return sections.map((section, index) => {
    const last = section.statements[section.statements.length - 1];
    if (last !== undefined && terminates(last)) return section;
    const next = sections[index + 1];
    return { ...section, statements: [...section.statements, next === undefined
      ? { kind: "BreakStatement" as const }
      : { kind: "GotoSwitchStatement" as const, label: next.label }] };
  });
}

function terminates(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "BreakStatement": case "ContinueStatement": case "GotoStatement":
    case "GotoSwitchStatement": case "ReturnStatement": case "ThrowStatement": return true;
    case "Block": {
      const last = statement.body.statements[statement.body.statements.length - 1];
      return last !== undefined && terminates(last);
    }
    default: return false;
  }
}
