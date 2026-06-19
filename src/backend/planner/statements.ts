import {
  AsBlock,
  AsBreakStatement,
  AsCaseBlock,
  AsCaseOrDefaultClause,
  AsCatchClause,
  AsContinueStatement,
  AsDoStatement,
  AsExpressionStatement,
  AsForInOrOfStatement,
  AsForStatement,
  AsIdentifier,
  AsIfStatement,
  AsLabeledStatement,
  AsReturnStatement,
  AsSwitchStatement,
  AsThrowStatement,
  AsTryStatement,
  AsVariableDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  AsWhileStatement,
  KindArrayBindingPattern,
  KindBlock,
  KindBreakStatement,
  KindContinueStatement,
  KindDebuggerStatement,
  KindDefaultClause,
  KindDoStatement,
  KindEmptyStatement,
  KindExpressionStatement,
  KindForInStatement,
  KindForOfStatement,
  KindForStatement,
  KindIdentifier,
  KindIfStatement,
  KindLabeledStatement,
  KindObjectBindingPattern,
  KindReturnStatement,
  KindSwitchStatement,
  KindThrowStatement,
  KindTryStatement,
  KindVariableDeclarationList,
  KindVariableStatement,
  KindWhileStatement,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpCatchClause,
  CsharpExpression,
  CsharpForInitializer,
  CsharpLocalDeclaration,
  CsharpStatement,
  CsharpSwitchSection,
} from "../ast/csharp-ast.js";
import { getCsharpTypeForNode, predefined, sameCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  allocateCatchValue,
  allocateControlLabel,
  allocateForOfItem,
  createDestructuringPlannerState,
  planBindingPatternFromExpression,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { isErasedAttributeExpressionStatement } from "./attributes.js";
import { planExpression } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "./locals.js";
import { planIdentifierName } from "./names.js";

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
  switch (node.Kind) {
    case KindEmptyStatement:
      return [];
    case KindBlock:
      return [{
        kind: "block",
        body: {
          statements: planBlockStatements(node, sourceFile, input, diagnostics, state),
        },
      }];
    case KindReturnStatement: {
      const statement = AsReturnStatement(node)!;
      return [{
        kind: "return",
        ...(statement.Expression !== undefined
          ? { expression: planExpression(statement.Expression, sourceFile, input, diagnostics) }
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
        return [{ kind: "goto", label: target.breakLabel }];
      }
      return [{ kind: "break" }];
    }
    case KindContinueStatement: {
      const statement = AsContinueStatement(node)!;
      if (statement.Label !== undefined) {
        const target = findControlLabel(state, Node_Text(statement.Label));
        if (target?.continueLabel === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Labeled continue target must be an iteration statement."));
          return [];
        }
        return [{ kind: "goto", label: target.continueLabel }];
      }
      return [{ kind: "continue" }];
    }
    case KindThrowStatement: {
      const statement = AsThrowStatement(node)!;
      if (statement.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
        return [];
      }
      return [{
        kind: "throw",
        expression: planExpression(statement.Expression, sourceFile, input, diagnostics),
      }];
    }
    case KindDebuggerStatement:
      return [expressionStatement({
        kind: "call",
        callee: {
          kind: "member",
          receiver: {
            kind: "member",
            receiver: {
              kind: "member",
              receiver: { kind: "identifier", name: "System" },
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
      return [planSwitchStatement(node, sourceFile, input, diagnostics, state)];
    case KindTryStatement:
      return [planTryStatement(node, sourceFile, input, diagnostics, state)];
    case KindExpressionStatement:
      if (isErasedAttributeExpressionStatement(node, input)) {
        return [];
      }
      return [expressionStatement(planExpression(AsExpressionStatement(node)!.Expression!, sourceFile, input, diagnostics))];
    case KindIfStatement: {
      const statement = AsIfStatement(node)!;
      return [{
        kind: "if",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        thenBody: {
          statements: planNestedStatementBody(statement.ThenStatement, sourceFile, input, diagnostics, state),
        },
        ...(statement.ElseStatement !== undefined
          ? { elseBody: { statements: planNestedStatementBody(statement.ElseStatement, sourceFile, input, diagnostics, state) } }
          : {}),
      }];
    }
    case KindWhileStatement: {
      const statement = AsWhileStatement(node)!;
      return [{
        kind: "while",
        condition: planExpression(statement.Expression!, sourceFile, input, diagnostics),
        body: {
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      }];
    }
    case KindDoStatement: {
      const statement = AsDoStatement(node)!;
      return [{
        kind: "do",
        body: {
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
        kind: "for",
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
          statements: planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
        },
      };
      const initializerPrelude = initializer?.prelude ?? [];
      return initializerPrelude.length === 0
        ? [plannedFor]
        : [{
            kind: "block",
            body: { statements: [...initializerPrelude, plannedFor] },
          }];
    }
    case KindForInStatement:
      diagnostics.push(unsupportedNodeDiagnostic(node, "For-in requires target property enumeration semantics and is not implemented yet."));
      return [];
    case KindForOfStatement: {
      const statement = AsForInOrOfStatement(node)!;
      if (statement.AwaitModifier !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "For-await-of requires async iteration semantics and is not implemented yet."));
      }
      return planForOfStatement(statement, sourceFile, input, diagnostics, state);
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

function planForOfStatement(
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const binding = planForOfBinding(statement.Initializer, sourceFile, input, diagnostics, state);
  if (binding === undefined) {
    return [];
  }
  return [{
    kind: "foreach",
    itemType: binding.type,
    itemName: binding.name,
    collection: planExpression(statement.Expression!, sourceFile, input, diagnostics),
    body: {
      statements: [
        ...binding.prelude,
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  }];
}

interface PlannedForOfBinding extends CsharpLocalDeclaration {
  readonly prelude: readonly CsharpStatement[];
}

function planForOfBinding(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForOfBinding | undefined {
  if (initializer === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_OF_BINDING",
      category: "error",
      source: "tsonic-csharp",
      message: "For-of statement has no initializer.",
    });
    return undefined;
  }
  if (initializer.Kind === KindVariableDeclarationList) {
    const declarations = AsVariableDeclarationList(initializer)!.Declarations?.Nodes ?? [];
    const first = declarations.find((declaration): declaration is Node => declaration !== undefined);
    if (first === undefined || declarations.filter((declaration) => declaration !== undefined).length !== 1) {
      diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of variable declaration must contain exactly one binding."));
      return undefined;
    }
    const variable = AsVariableDeclaration(first)!;
    if (variable.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(first, "For-of variable declaration cannot have an initializer."));
    }
    if (variable.name?.Kind === KindObjectBindingPattern || variable.name?.Kind === KindArrayBindingPattern) {
      const itemName = allocateForOfItem(state);
      return {
        name: itemName,
        type: variable.Type === undefined
          ? predefined("var")
          : getCsharpTypeForNode(variable.Type, sourceFile, input, predefined("var"), diagnostics),
        prelude: planBindingPatternFromExpression(
          variable.name,
          { kind: "identifier", name: itemName },
          sourceFile,
          input,
          diagnostics,
          state,
        ),
      };
    }
    return {
      ...planLocalDeclaration(first, sourceFile, input, diagnostics),
      prelude: [],
    };
  }
  if (initializer.Kind === KindIdentifier) {
    const identifier = AsIdentifier(initializer)!;
    return {
      name: sanitizeIdentifier(identifier.Text),
      type: getCsharpTypeForNode(initializer, sourceFile, input, undefined, diagnostics),
      prelude: [],
    };
  }
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "For-of initializer binding is outside the current C# planning surface."));
  return undefined;
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
    kind: "block",
    body: { statements },
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
    breakLabel: allocateControlLabel(state, sourceName, "break"),
    ...(isIterationStatement(statement.Statement)
      ? { continueLabel: allocateControlLabel(state, sourceName, "continue") }
      : {}),
  };
  state.controlLabels.push(target);
  const planned = planSingleStatement(statement.Statement, sourceFile, input, diagnostics, state);
  state.controlLabels.pop();
  const loweredStatement = target.continueLabel === undefined
    ? planned
    : attachContinueLabel(planned, target.continueLabel);
  return {
    kind: "block",
    body: {
      statements: [
        {
          kind: "label",
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

function isIterationStatement(node: Node | undefined): boolean {
  return node?.Kind === KindWhileStatement ||
    node?.Kind === KindDoStatement ||
    node?.Kind === KindForStatement ||
    node?.Kind === KindForOfStatement;
}

function attachContinueLabel(statement: CsharpStatement, label: string): CsharpStatement {
  switch (statement.kind) {
    case "while":
    case "do":
    case "for":
    case "foreach":
      return {
        ...statement,
        body: {
          statements: [
            ...statement.body.statements,
            controlLabelStatement(label),
          ],
        },
      };
    case "block": {
      const lastIndex = statement.body.statements.length - 1;
      const last = statement.body.statements[lastIndex];
      if (last !== undefined) {
        return {
          kind: "block",
          body: {
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
    kind: "label",
    name: label,
    statement: {
      kind: "block",
      body: { statements: [] },
    },
  };
}

function planSwitchStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpStatement {
  const statement = AsSwitchStatement(node)!;
  return {
    kind: "switch",
    expression: planExpression(statement.Expression!, sourceFile, input, diagnostics),
    sections: planSwitchSections(statement.CaseBlock, sourceFile, input, diagnostics, state),
  };
}

function planSwitchSections(
  caseBlockNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpSwitchSection[] {
  if (caseBlockNode === undefined) {
    return [];
  }
  const caseBlock = AsCaseBlock(caseBlockNode)!;
  const sections = (caseBlock.Clauses?.Nodes ?? [])
    .filter((clause): clause is Node => clause !== undefined)
    .map((clause) => planSwitchSection(clause, sourceFile, input, diagnostics, state));
  return sections.map((section, index) => {
    const last = section.statements[section.statements.length - 1];
    const next = sections[index + 1];
    if (next !== undefined && (last === undefined || !statementTerminatesSwitchSection(last))) {
      return {
        ...section,
        statements: [
          ...section.statements,
          { kind: "goto-switch" as const, label: next.label },
        ],
      };
    }
    if (next === undefined && (last === undefined || !statementTerminatesSwitchSection(last))) {
      return {
        ...section,
        statements: [
          ...section.statements,
          { kind: "break" as const },
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
): CsharpSwitchSection {
  const clause = AsCaseOrDefaultClause(clauseNode)!;
  return {
    label: clauseNode.Kind === KindDefaultClause
      ? { kind: "default" }
      : { kind: "case", expression: planExpression(clause.Expression!, sourceFile, input, diagnostics) },
    statements: (clause.Statements?.Nodes ?? [])
      .filter((statement): statement is Node => statement !== undefined)
      .flatMap((statement) => planStatements(statement, sourceFile, input, diagnostics, state)),
  };
}

function statementTerminatesSwitchSection(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "break":
    case "continue":
    case "goto":
    case "goto-switch":
    case "return":
    case "throw":
      return true;
    case "block": {
      const last = statement.body.statements[statement.body.statements.length - 1];
      return last !== undefined && statementTerminatesSwitchSection(last);
    }
    default:
      return false;
  }
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
    kind: "try",
    tryBody: {
      statements: planBlockStatements(statement.TryBlock, sourceFile, input, diagnostics, state),
    },
    ...(statement.CatchClause !== undefined
      ? { catchClause: planCatchClause(statement.CatchClause, sourceFile, input, diagnostics, state) }
      : {}),
    ...(statement.FinallyBlock !== undefined
      ? { finallyBody: { statements: planBlockStatements(statement.FinallyBlock, sourceFile, input, diagnostics, state) } }
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
    if (variable.name?.Kind === KindObjectBindingPattern || variable.name?.Kind === KindArrayBindingPattern) {
      diagnostics.push(unsupportedNodeDiagnostic(variable.name, "Catch destructuring requires a closed thrown-value carrier; unknown catch values cannot trickle into C#."));
      return {
        variableName: allocateCatchValue(state),
        body: {
          statements: planBlockStatements(clause.Block, sourceFile, input, diagnostics, state),
        },
      };
    }
  }
  return {
    ...(clause.VariableDeclaration !== undefined
      ? { variableName: planIdentifierName(AsVariableDeclaration(clause.VariableDeclaration)!.name, "ex", diagnostics, "Catch variable name") }
      : {}),
    body: {
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
  if (node.Kind === KindVariableDeclarationList) {
    const declarations = AsVariableDeclarationList(node)!.Declarations?.Nodes ?? [];
    const concreteDeclarations = declarations.filter((declaration): declaration is Node => declaration !== undefined);
    if (concreteDeclarations.some((declaration) => {
      const variable = AsVariableDeclaration(declaration)!;
      return variable.name?.Kind === KindObjectBindingPattern || variable.name?.Kind === KindArrayBindingPattern;
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
        prelude: locals.map((local) => ({ kind: "local", ...local })),
      };
    }
    return {
      initializer: {
        kind: "locals",
        locals,
      },
      prelude: [],
    };
  }
  return {
    initializer: {
      kind: "expression",
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
  if (node.Kind === KindBlock) {
    return planBlockStatements(node, sourceFile, input, diagnostics, state);
  }
  return planStatements(node, sourceFile, input, diagnostics, state);
}

function expressionStatement(expression: CsharpExpression): CsharpStatement {
  return {
    kind: "expression",
    expression,
  };
}
