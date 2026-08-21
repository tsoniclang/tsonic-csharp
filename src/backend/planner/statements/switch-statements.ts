import type { CsharpPlanningContext } from "../context.js";
import {
  AsAsExpression,
  AsCaseBlock,
  AsCaseOrDefaultClause,
  AsNonNullExpression,
  AsParenthesizedExpression,
  AsSatisfiesExpression,
  AsSwitchStatement,
  AsTypeAssertion,
  HasSourceKind,
  KindAsExpression,
  KindDefaultClause,
  KindFalseKeyword,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindParenthesizedExpression,
  KindSatisfiesExpression,
  KindStringLiteral,
  KindTrueKeyword,
  KindTypeAssertionExpression,
  SourceKind,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement, CsharpSwitchSection } from "../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

interface SwitchStatementPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined;
  readonly planStatements: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpPlanningContext,
    diagnostics: TargetDiagnostic[],
    state: DestructuringPlannerState,
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
  const statement = AsSwitchStatement(input.program.source.ast, node)!;
  const expression = planSwitchExpression(statement.Expression, node, sourceFile, input, diagnostics, planner);
  if (expression === undefined) {
    return undefined;
  }
  const sections = planSwitchSections(statement.CaseBlock, sourceFile, input, diagnostics, state, planner);
  if (sections === undefined) {
    return undefined;
  }
  return {
    kind: "SwitchStatement",
    expression,
    sections,
  };
}

function planSwitchExpression(
  expression: Node | undefined,
  statementNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planner: SwitchStatementPlanner,
): CsharpExpression | undefined {
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "Switch statement requires a governing expression before C# emission."));
    return undefined;
  }
  return planner.planExpression(expression, sourceFile, input, diagnostics);
}

function planSwitchSections(
  caseBlockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): readonly CsharpSwitchSection[] | undefined {
  if (caseBlockNode === undefined) {
    return [];
  }
  const caseBlock = AsCaseBlock(input.program.source.ast, caseBlockNode)!;
  const clauses = (caseBlock.Clauses?.Nodes ?? [])
    .filter((clause): clause is Node => clause !== undefined);
  diagnoseDuplicateDefaultClauses(clauses, input, diagnostics);
  const sections: CsharpSwitchSection[] = [];
  for (const clause of clauses) {
    const section = planSwitchSection(clause, sourceFile, input, diagnostics, state, planner);
    if (section === undefined) {
      return undefined;
    }
    sections.push(section);
  }
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planner: SwitchStatementPlanner,
): CsharpSwitchSection | undefined {
  const clause = AsCaseOrDefaultClause(input.program.source.ast, clauseNode)!;
  const label = planSwitchLabel(clauseNode, clause.Expression, sourceFile, input, diagnostics, planner);
  if (label === undefined) {
    return undefined;
  }
  return {
    kind: "SwitchSection",
    label,
    statements: (clause.Statements?.Nodes ?? [])
      .filter((statement): statement is Node => statement !== undefined)
      .flatMap((statement) => planner.planStatements(statement, sourceFile, input, diagnostics, state)),
  };
}

function planSwitchLabel(
  clauseNode: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planner: SwitchStatementPlanner,
): CsharpSwitchSection["label"] | undefined {
  if (HasSourceKind(input.program.source.ast, clauseNode, KindDefaultClause)) {
    return { kind: "DefaultSwitchLabel" };
  }
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(clauseNode, "Switch case clause requires an expression before C# emission."));
    return undefined;
  }
  if (!isNativeCsharpSwitchCaseLabelExpression(expression, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Switch case labels must be C# compile-time constants; arbitrary TypeScript case expressions require finalized switch lowering facts before C# emission."));
  }
  const planned = planner.planExpression(expression, sourceFile, input, diagnostics);
  return planned === undefined ? undefined : { kind: "CaseSwitchLabel", expression: planned };
}

function diagnoseDuplicateDefaultClauses(
  clauses: readonly Node[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  let hasDefault = false;
  for (const clause of clauses) {
    if (!HasSourceKind(input.program.source.ast, clause, KindDefaultClause)) {
      continue;
    }
    if (hasDefault) {
      diagnostics.push(unsupportedNodeDiagnostic(clause, "Switch statement cannot emit more than one default clause to C#."));
      continue;
    }
    hasDefault = true;
  }
}

function isNativeCsharpSwitchCaseLabelExpression(
  expression: Node,
  input: CsharpPlanningContext,
): boolean {
  switch (SourceKind(input.program.source.ast, expression)) {
    case KindStringLiteral:
    case KindNoSubstitutionTemplateLiteral:
    case KindNumericLiteral:
    case KindTrueKeyword:
    case KindFalseKeyword:
    case KindNullKeyword:
      return true;
    case KindAsExpression:
      return AsAsExpression(input.program.source.ast, expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsAsExpression(input.program.source.ast, expression)!.Expression!, input);
    case KindSatisfiesExpression:
      return AsSatisfiesExpression(input.program.source.ast, expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsSatisfiesExpression(input.program.source.ast, expression)!.Expression!, input);
    case KindNonNullExpression:
      return AsNonNullExpression(input.program.source.ast, expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsNonNullExpression(input.program.source.ast, expression)!.Expression!, input);
    case KindTypeAssertionExpression:
      return AsTypeAssertion(input.program.source.ast, expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsTypeAssertion(input.program.source.ast, expression)!.Expression!, input);
    case KindParenthesizedExpression:
      return AsParenthesizedExpression(input.program.source.ast, expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsParenthesizedExpression(input.program.source.ast, expression)!.Expression!, input);
    default:
      return false;
  }
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
