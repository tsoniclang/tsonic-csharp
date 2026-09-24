import type { CsharpPlanningContext } from "../context.js";
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
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  createDestructuringPlannerState,
} from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { planExpression } from "../expressions/index.js";
import { planClassFactoryExpression } from "../declarations/class-factories.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planLocalDeclarationStatements } from "../bindings/locals.js";
import { planCsharpCaptureFrame, planCsharpCaptureEntryBindings } from "../bindings/capture-storage.js";
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
import {
  planResourceManagedBlockStatements,
} from "./resource-management.js";
import {
  isExplicitUnsafeBlockMarker,
  withExplicitUnsafeContext,
} from "../safety/explicit-safety.js";

export function planBlockStatements(
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
  entryPrelude: readonly CsharpStatement[] = [],
  skipLeadingStatements = 0,
): readonly CsharpStatement[] {
  if (blockNode === undefined) {
    return [];
  }
  const block = AsBlock(input.program.source.ast, blockNode)!;
  const statements = (block.Statements?.Nodes ?? []).slice(skipLeadingStatements).filter(
    (statement): statement is Node => statement !== undefined,
  );
  const explicitUnsafe = isExplicitUnsafeBlockMarker(statements[0], input);
  const captures = planCsharpCaptureFrame(blockNode, input, diagnostics, state);
  const plan = () => [...captures, ...entryPrelude, ...planCsharpCaptureEntryBindings(blockNode, input, state), ...planResourceManagedBlockStatements(
    blockNode,
    input,
    diagnostics,
    state,
    () => (explicitUnsafe ? statements.slice(1) : statements).flatMap(
      (statement) => planStatements(
        statement,
        sourceFile,
        input,
        diagnostics,
        state,
      ),
    ),
  )];
  if (!explicitUnsafe) {
    return plan();
  }
  const planned = withExplicitUnsafeContext(state, plan);
  return [{
    kind: "UnsafeStatement",
    body: { kind: "Block", statements: planned },
  }];
}

export function planStatements(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
): readonly CsharpStatement[] {
  switch (SourceKind(input.program.source.ast, node)) {
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
      return planBreakStatement(node, input.program.source.ast, diagnostics, state);
    case KindContinueStatement:
      return planContinueStatement(node, input.program.source.ast, diagnostics, state);
    case KindThrowStatement:
      return planThrowStatement(node, sourceFile, input, diagnostics, state);
    case KindDebuggerStatement:
      return planDebuggerStatement();
    case KindLabeledStatement: {
      const statement = AsLabeledStatement(input.program.source.ast, node)!;
      return [planLabeledStatement(statement, sourceFile, input, diagnostics, state, planNestedStatementBody)];
    }
    case KindSwitchStatement: {
      const statement = planSwitchStatement(node, sourceFile, input, diagnostics, state, {
        planExpression,
        planStatements,
      });
      if (statement === undefined) return [];
      const body = input.program.source.ast.as.AsSwitchStatement(node)?.CaseBlock;
      const captures = body === undefined ? [] : planCsharpCaptureFrame(body, input, diagnostics, state);
      return captures.length === 0 ? [statement] : [{ kind: "Block", body: { kind: "Block", statements: [...captures, statement] } }];
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
      return planForInStatement(node, AsForInOrOfStatement(input.program.source.ast, node)!, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(input.program.source.ast, node)!;
      return planForOfStatement(node, statement, sourceFile, input, diagnostics, state, planNestedStatementBody);
    }
    case "KindClassDeclaration": {
      const factory = input.program.classFactories.get(node);
      const initializer = factory === undefined ? undefined : planClassFactoryExpression(factory, sourceFile, input, diagnostics, state);
      const type = factory === undefined ? undefined : csharpTypeFromTargetTypeRef(factory.factoryType);
      if (initializer === undefined || type === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "A local class requires a sealed native factory."));
        return [];
      }
      return [{ kind: "LocalDeclarationStatement", type, initializer,
        name: planIdentifierName(input.program.source.ast.name(node), "Class", input, diagnostics, "Local class") }];
    }
    case KindVariableStatement: {
      const declarationList = AsVariableStatement(input.program.source.ast, node)!.DeclarationList;
      const declarations = declarationList === undefined
        ? []
        : input.program.source.ast.children(declarationList)
          .filter((declaration): declaration is Node => declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration));
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (node === undefined) {
    return [];
  }
  if (HasSourceKind(input.program.source.ast, node, KindBlock)) {
    return planBlockStatements(node, sourceFile, input, diagnostics, state);
  }
  return planStatements(node, sourceFile, input, diagnostics, state);
}
