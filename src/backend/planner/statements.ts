import {
  AsBlock,
  AsBreakStatement,
  AsCatchClause,
  AsContinueStatement,
  AsDoStatement,
  AsExpressionStatement,
  AsForInOrOfStatement,
  AsForStatement,
  AsIfStatement,
  AsLabeledStatement,
  AsReturnStatement,
  AsThrowStatement,
  AsTryStatement,
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
  CsharpCatchClause,
  CsharpForInitializer,
  CsharpStatement,
} from "../roslyn/syntax.js";
import { sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateControlLabel,
  createDestructuringPlannerState,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { isErasedAttributeExpressionStatement } from "./attributes.js";
import { planExpression, planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "./locals.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import {
  expressionStatement,
  isCsharpExceptionCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
} from "./statement-output.js";
import { planSwitchStatement } from "./switch-statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { planForInStatement, planForOfStatement } from "./statement-loops.js";

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
      return [planLabeledStatement(statement, sourceFile, input, diagnostics, state)];
    }
    case KindSwitchStatement:
      return [planSwitchStatement(node, sourceFile, input, diagnostics, state, {
        planExpression,
        planStatements,
      })];
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics, state)];
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

function planSingleStatement(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
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

function planLabeledStatement(
  statement: NonNullable<ReturnType<typeof AsLabeledStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const sourceName = sanitizeIdentifier(Node_Text(statement.Label!));
  const target = {
    sourceName,
    breakLabel: allocateControlLabel(state, sourceName, "BreakStatement"),
    ...(isIterationStatement(statement.Statement, input)
      ? { continueLabel: allocateControlLabel(state, sourceName, "ContinueStatement") }
      : {}),
  };
  state.controlLabels.push(target);
  const planned = planSingleStatement(statement.Statement, sourceFile, input, diagnostics, state);
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

function findControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
): { readonly breakLabel: string; readonly continueLabel?: string } | undefined {
  const sanitized = sanitizeIdentifier(sourceName);
  for (let index = state.controlLabels.length - 1; index >= 0; index--) {
    const target = state.controlLabels[index]!;
    if (target.sourceName === sanitized) {
      return target;
    }
  }
  return undefined;
}

function isIterationStatement(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindWhileStatement) ||
    HasSourceKind(input.ast, node, KindDoStatement) ||
    HasSourceKind(input.ast, node, KindForStatement) ||
    HasSourceKind(input.ast, node, KindForInStatement) ||
    HasSourceKind(input.ast, node, KindForOfStatement);
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

function planTryStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const statement = AsTryStatement(node)!;
  return {
    kind: "TryStatement",
    tryBody: {
      kind: "Block",
      statements: planBlockStatements(statement.TryBlock, sourceFile, input, diagnostics, state),
    },
    ...(statement.CatchClause !== undefined
      ? { catchClause: planCatchClause(statement.CatchClause, sourceFile, input, diagnostics, state) }
      : {}),
    ...(statement.FinallyBlock !== undefined
      ? { finallyBody: { kind: "Block", statements: planBlockStatements(statement.FinallyBlock, sourceFile, input, diagnostics, state) } }
      : {}),
  };
}

function planCatchClause(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpCatchClause {
  const clause = AsCatchClause(node)!;
  if (clause.VariableDeclaration !== undefined) {
    const variable = AsVariableDeclaration(clause.VariableDeclaration)!;
    const variableName = variable.name;
    if (variableName !== undefined && (HasSourceKind(input.ast, variableName, KindObjectBindingPattern) || HasSourceKind(input.ast, variableName, KindArrayBindingPattern))) {
      diagnostics.push(unsupportedNodeDiagnostic(variableName, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    const carrier = getRuntimeCarrierForExpression(input, variable.name ?? clause.VariableDeclaration, sourceFile) ??
      getRuntimeCarrierForExpression(input, clause.VariableDeclaration, sourceFile);
    const variableType = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier);
    if (!isCsharpExceptionCarrier(carrier) || variableType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name ?? clause.VariableDeclaration, "Catch variables require finalized TSTS/provider exception-carrier facts before C# emission."));
      return {
        kind: "CatchClause",
        body: {
          kind: "Block",
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
    return {
      kind: "CatchClause",
      variableType,
      variableName: variable.name === undefined ? undefined : sanitizeIdentifier(Node_Text(variable.name)),
      body: {
        kind: "Block",
        statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
      },
    };
  }
  return {
    kind: "CatchClause",
    body: {
      kind: "Block",
      statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
    },
  };
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
