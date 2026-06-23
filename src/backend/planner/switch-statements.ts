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
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpStatement, CsharpSwitchSection } from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";

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
    expression: planSwitchExpression(statement.Expression, node, sourceFile, input, diagnostics, planner),
    sections: planSwitchSections(statement.CaseBlock, sourceFile, input, diagnostics, state, planner),
  };
}

function planSwitchExpression(
  expression: Node | undefined,
  statementNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: SwitchStatementPlanner,
): CsharpExpression {
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statementNode, "Switch statement requires a governing expression before C# emission."));
    return invalidExpression("missing switch expression");
  }
  return planner.planExpression(expression, sourceFile, input, diagnostics);
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
  const clauses = (caseBlock.Clauses?.Nodes ?? [])
    .filter((clause): clause is Node => clause !== undefined);
  diagnoseDuplicateDefaultClauses(clauses, input, diagnostics);
  const sections = clauses.map((clause) => planSwitchSection(clause, sourceFile, input, diagnostics, state, planner));
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
    label: planSwitchLabel(clauseNode, clause.Expression, sourceFile, input, diagnostics, planner),
    statements: (clause.Statements?.Nodes ?? [])
      .filter((statement): statement is Node => statement !== undefined)
      .flatMap((statement) => planner.planStatements(statement, sourceFile, input, diagnostics, state)),
  };
}

function planSwitchLabel(
  clauseNode: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planner: SwitchStatementPlanner,
): CsharpSwitchSection["label"] {
  if (HasSourceKind(input.ast, clauseNode, KindDefaultClause)) {
    return { kind: "DefaultSwitchLabel" };
  }
  if (expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(clauseNode, "Switch case clause requires an expression before C# emission."));
    return { kind: "CaseSwitchLabel", expression: invalidExpression("missing switch case expression") };
  }
  if (!isNativeCsharpSwitchCaseLabelExpression(expression, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Switch case labels must be C# compile-time constants; arbitrary TypeScript case expressions require finalized switch lowering facts before C# emission."));
  }
  return { kind: "CaseSwitchLabel", expression: planner.planExpression(expression, sourceFile, input, diagnostics) };
}

function diagnoseDuplicateDefaultClauses(
  clauses: readonly Node[],
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  let hasDefault = false;
  for (const clause of clauses) {
    if (!HasSourceKind(input.ast, clause, KindDefaultClause)) {
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
  input: TargetCompileInput,
): boolean {
  switch (SourceKind(input.ast, expression)) {
    case KindStringLiteral:
    case KindNoSubstitutionTemplateLiteral:
    case KindNumericLiteral:
    case KindTrueKeyword:
    case KindFalseKeyword:
    case KindNullKeyword:
      return true;
    case KindAsExpression:
      return AsAsExpression(expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsAsExpression(expression)!.Expression!, input);
    case KindSatisfiesExpression:
      return AsSatisfiesExpression(expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsSatisfiesExpression(expression)!.Expression!, input);
    case KindNonNullExpression:
      return AsNonNullExpression(expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsNonNullExpression(expression)!.Expression!, input);
    case KindTypeAssertionExpression:
      return AsTypeAssertion(expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsTypeAssertion(expression)!.Expression!, input);
    case KindParenthesizedExpression:
      return AsParenthesizedExpression(expression)?.Expression === undefined
        ? false
        : isNativeCsharpSwitchCaseLabelExpression(AsParenthesizedExpression(expression)!.Expression!, input);
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
