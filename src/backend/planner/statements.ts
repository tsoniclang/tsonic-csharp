import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsBlock,
  AsForInOrOfStatement,
  AsLabeledStatement,
  AsVariableStatement,
  KindBlock,
  KindBreakStatement,
  KindContinueStatement,
  KindDebuggerStatement,
  KindDoStatement,
  KindEmptyStatement,
  KindExpressionStatement,
  KindForInStatement,
  KindForOfStatement,
  KindForStatement,
  KindIfStatement,
  KindLabeledStatement,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindVariableStatement,
  KindWhileStatement,
  HasSourceKind,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpStatement,
} from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  createDestructuringPlannerState,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { planExpression } from "./expressions.js";
import { planLocalDeclarationStatements } from "./locals.js";
import {
  planDoStatement,
  planIfStatement,
  planWhileStatement,
} from "./statement-conditionals.js";
import {
  planForStatement,
} from "./statement-for.js";
import { planSwitchStatement } from "./switch-statements.js";
import { planForInStatement, planForOfStatement } from "./statement-loops.js";
import { planLabeledStatement } from "./statement-labels.js";
import { planTryStatement } from "./statement-try.js";
import {
  planBreakStatement,
  planContinueStatement,
  planDebuggerStatement,
  planExpressionStatement,
  planReturnStatement,
  planThrowStatement,
} from "./statement-simple.js";

export function planBlockStatements(
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): readonly CsharpStatement[] {
  if (blockNode === undefined) {
    return [];
  }
  const block = AsBlock(blockNode)!;
  return (block.Statements?.Nodes ?? []).flatMap((statement) =>
    statement === undefined ? [] : planStatements(statement, sourceFile, input, diagnostics, state));
}

export function planStatements(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): readonly CsharpStatement[] {
  switch (SourceKind(input.ast, node)) {
    case KindEmptyStatement:
      return [];
    case KindBlock:
      return [{
        kind: "Block",
        body: {
          kind: "Block",
          statements: planBlockStatements(node, sourceFile, input, diagnostics, state),
        },
      }];
    case KindReturnStatement:
      return planReturnStatement(node, sourceFile, input, diagnostics, state);
    case KindBreakStatement:
      return planBreakStatement(node, input.ast, diagnostics, state);
    case KindContinueStatement:
      return planContinueStatement(node, input.ast, diagnostics, state);
    case KindThrowStatement:
      return planThrowStatement(node, sourceFile, input, diagnostics, state);
    case KindDebuggerStatement:
      return planDebuggerStatement();
    case KindLabeledStatement: {
      const statement = AsLabeledStatement(node)!;
      return [planLabeledStatement(statement, sourceFile, input, diagnostics, state, planNestedStatementBody)];
    }
    case KindSwitchStatement: {
      const statement = planSwitchStatement(node, sourceFile, input, diagnostics, state, {
        planExpression,
        planStatements,
      });
      return statement === undefined ? [] : [statement];
    }
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics, state, planBlockStatements)];
    case KindExpressionStatement:
      return planExpressionStatement(node, sourceFile, input, diagnostics, state);
    case KindIfStatement:
      return planIfStatement(node, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindWhileStatement:
      return planWhileStatement(node, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindDoStatement:
      return planDoStatement(node, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindForStatement:
      return planForStatement(node, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindForInStatement:
      return planForInStatement(node, AsForInOrOfStatement(node)!, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(node)!;
      return planForOfStatement(node, statement, sourceFile, input, diagnostics, state, planNestedStatementBody);
    }
    case KindVariableStatement: {
      const declarationList = AsVariableStatement(node)!.DeclarationList;
      const declarations = declarationList === undefined
        ? []
        : input.ast.children(declarationList)
          .filter((declaration): declaration is Node => declaration !== undefined && input.ast.is.IsVariableDeclaration(declaration));
      if (declarations.length === 0) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Variable statement has no declaration."));
        return [];
      }
      return declarations.flatMap((declaration) => planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state));
    }
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Statement is outside the current C# planning surface."));
      return [];
  }
}

function planNestedStatementBody(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (node === undefined) {
    return [];
  }
  if (HasSourceKind(input.ast, node, KindBlock)) {
    return planBlockStatements(node, sourceFile, input, diagnostics, state);
  }
  return planStatements(node, sourceFile, input, diagnostics, state);
}
