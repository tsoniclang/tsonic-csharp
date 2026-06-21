import {
  AsBlock,
  AsBreakStatement,
  AsContinueStatement,
  AsDoStatement,
  AsExpressionStatement,
  AsForInOrOfStatement,
  AsForStatement,
  AsIfStatement,
  AsLabeledStatement,
  AsReturnStatement,
  AsThrowStatement,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  AsVoidExpression,
  AsWhileStatement,
  KindArrayBindingPattern,
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
  KindObjectBindingPattern,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindVariableDeclarationList,
  KindVariableStatement,
  KindVoidExpression,
  KindWhileStatement,
  HasSourceKind,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpForInitializer,
  CsharpStatement,
} from "../roslyn/syntax.js";
import { sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  createDestructuringPlannerState,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { isErasedAttributeExpressionStatement } from "./attributes.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "./locals.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import {
  expressionStatement,
  isCsharpExceptionCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
} from "./statement-output.js";
import { planSwitchStatement } from "./switch-statements.js";
import { planForInStatement, planForOfStatement } from "./statement-loops.js";
import { findControlLabel, planLabeledStatement } from "./statement-labels.js";
import { planTryStatement } from "./statement-try.js";

export function planBlockStatements(
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
  input: TargetCompileInput,
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
    case KindReturnStatement: {
      const statement = AsReturnStatement(node)!;
      if (
        HasSourceKind(input.ast, statement.Expression, KindVoidExpression) &&
        state.currentReturnType !== undefined &&
        isVoidCsharpType(state.currentReturnType)
      ) {
        const voidExpression = AsVoidExpression(statement.Expression)!;
        return [
          expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics))),
          { kind: "ReturnStatement" },
        ];
      }
      return [{
        kind: "ReturnStatement",
        ...(statement.Expression !== undefined
          ? {
              expression: state.currentReturnType === undefined
                ? planExpression(statement.Expression, sourceFile, input, diagnostics)
                : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, state.currentReturnType, state.currentReturnTypeSubject),
            }
          : {}),
      }];
    }
    case KindBreakStatement: {
      const statement = AsBreakStatement(node)!;
      if (statement.Label !== undefined) {
        const target = findControlLabel(state, Node_Text(statement.Label));
        if (target === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled break target was not available from TSTS control-flow binding."));
          return [];
        }
        return [{ kind: "GotoStatement", label: target.breakLabel }];
      }
      return [{ kind: "BreakStatement" }];
    }
    case KindContinueStatement: {
      const statement = AsContinueStatement(node)!;
      if (statement.Label !== undefined) {
        const target = findControlLabel(state, Node_Text(statement.Label));
        if (target?.continueLabel === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled continue target must be an iteration statement."));
          return [];
        }
        return [{ kind: "GotoStatement", label: target.continueLabel }];
      }
      return [{ kind: "ContinueStatement" }];
    }
    case KindThrowStatement: {
      const statement = AsThrowStatement(node)!;
      if (statement.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
        return [];
      }
      const carrier = getRuntimeCarrierForExpression(input, statement.Expression, sourceFile);
      if (!isCsharpExceptionCarrier(carrier)) {
        diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Throw statements require finalized TSTS/provider exception-carrier facts before C# emission."));
        return [];
      }
      return [{
        kind: "ThrowStatement",
        expression: planExpression(statement.Expression, sourceFile, input, diagnostics),
      }];
    }
    case KindDebuggerStatement:
      return [expressionStatement({
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: {
            kind: "SimpleMemberAccessExpression",
            receiver: {
              kind: "SimpleMemberAccessExpression",
              receiver: { kind: "IdentifierName", name: "System" },
              name: "Diagnostics",
            },
            name: "Debugger",
          },
          name: "Break",
        },
        arguments: [],
      })];
    case KindLabeledStatement: {
      const statement = AsLabeledStatement(node)!;
      return [planLabeledStatement(statement, sourceFile, input, diagnostics, state, planNestedStatementBody)];
    }
    case KindSwitchStatement:
      return [planSwitchStatement(node, sourceFile, input, diagnostics, state, {
        planExpression,
        planStatements,
      })];
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics, state, planBlockStatements)];
    case KindExpressionStatement:
      if (isErasedAttributeExpressionStatement(node, input)) {
        return [];
      }
      if (HasSourceKind(input.ast, AsExpressionStatement(node)!.Expression, KindVoidExpression)) {
        const voidExpression = AsVoidExpression(AsExpressionStatement(node)!.Expression!)!;
        return [expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics)))];
      }
      return [expressionStatement(planDiscardedExpression(planExpression(AsExpressionStatement(node)!.Expression!, sourceFile, input, diagnostics)))];
    case KindIfStatement: {
      const statement = AsIfStatement(node)!;
      return [{
        kind: "IfStatement",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        thenBody: {
          kind: "Block",
          statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics, state),
        },
        ...(statement.ElseStatement !== undefined
          ? { elseBody: { kind: "Block", statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics, state) } }
          : {}),
      }];
    }
    case KindWhileStatement: {
      const statement = AsWhileStatement(node)!;
      return [{
        kind: "WhileStatement",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      }];
    }
    case KindDoStatement: {
      const statement = AsDoStatement(node)!;
      return [{
        kind: "DoStatement",
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
      }];
    }
    case KindForStatement: {
      const statement = AsForStatement(node)!;
      const initializer = statement.Initializer === undefined
        ? undefined
        : planForInitializer(statement.Initializer, sourceFile, input, diagnostics, state);
      const plannedFor: CsharpStatement = {
        kind: "ForStatement",
        ...(initializer?.initializer !== undefined
          ? { initializer: initializer.initializer }
          : {}),
        ...(statement.Condition !== undefined
          ? { condition: planExpression(statement.Condition, sourceFile, input, diagnostics) }
          : {}),
        ...(statement.Incrementor !== undefined
          ? { incrementor: planExpression(statement.Incrementor, sourceFile, input, diagnostics) }
          : {}),
        body: {
          kind: "Block",
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      };
      const initializerPrelude = initializer?.prelude ?? [];
      return initializerPrelude.length === 0
          ? [plannedFor]
        : [{
            kind: "Block",
            body: { kind: "Block", statements: [...initializerPrelude, plannedFor] },
          }];
    }
    case KindForInStatement:
      return planForInStatement(node, AsForInOrOfStatement(node)!, sourceFile, input, diagnostics, state, planNestedStatementBody);
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(node)!;
      if (statement.AwaitModifier !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "For-await-of requires async iteration semantics and is not implemented yet."));
      }
      return planForOfStatement(node, statement, sourceFile, input, diagnostics, state, planNestedStatementBody);
    }
    case KindVariableStatement: {
      const declarationList = AsVariableStatement(node)!.DeclarationList;
      const declarations = AsVariableDeclarationList(declarationList)!.Declarations?.Nodes ?? [];
      if (declarations.length === 0) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Variable statement has no declaration."));
        return [];
      }
      return declarations
        .filter((declaration): declaration is Node => declaration !== undefined)
        .flatMap((declaration) => planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state));
    }
    default:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Statement is outside the current C# planning surface."));
      return [];
  }
}

interface PlannedForInitializer {
  readonly initializer?: CsharpForInitializer;
  readonly prelude: readonly CsharpStatement[];
}

function planForInitializer(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForInitializer {
  if (HasSourceKind(input.ast, node, KindVariableDeclarationList)) {
    const declarations = AsVariableDeclarationList(node)!.Declarations?.Nodes ?? [];
    const concreteDeclarations = declarations.filter((declaration): declaration is Node => declaration !== undefined);
    if (concreteDeclarations.some((declaration) => {
      const variable = AsVariableDeclaration(declaration)!;
      return HasSourceKind(input.ast, variable.name, KindObjectBindingPattern) || HasSourceKind(input.ast, variable.name, KindArrayBindingPattern);
    })) {
      return {
        prelude: concreteDeclarations.flatMap((declaration) =>
          planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)),
      };
    }
    const locals = declarations
      .filter((declaration): declaration is Node => declaration !== undefined)
      .map((declaration) => planLocalDeclaration(declaration, sourceFile, input, diagnostics));
    const first = locals[0];
    if (first !== undefined && locals.some((local) => !sameCsharpType(local.type, first.type))) {
      return {
        prelude: locals.map((local) => ({
          kind: "LocalDeclarationStatement",
          name: local.name,
          type: local.type,
          ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
        })),
      };
    }
    return {
      initializer: {
        kind: "VariableDeclaration",
        locals,
      },
      prelude: [],
    };
  }
  return {
    initializer: {
      kind: "Expression",
      expression: planExpression(node, sourceFile, input, diagnostics),
    },
    prelude: [],
  };
}

function planNestedStatementBody(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
