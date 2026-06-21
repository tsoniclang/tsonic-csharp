import {
  AsBreakStatement,
  AsContinueStatement,
  AsExpressionStatement,
  AsReturnStatement,
  AsThrowStatement,
  AsVoidExpression,
  HasSourceKind,
  KindVoidExpression,
  Node_Text,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpStatement,
} from "../roslyn/syntax.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  isErasedAttributeExpressionStatement,
} from "./attributes.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  planExpression,
  planExpressionWithExpectedType,
} from "./expressions.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  findControlLabel,
} from "./statement-labels.js";
import {
  expressionStatement,
  isCsharpThrowableCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
} from "./statement-output.js";

export function planReturnStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
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

export function planBreakStatement(
  node: Node,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
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

export function planContinueStatement(
  node: Node,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
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

export function planThrowStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  const statement = AsThrowStatement(node)!;
  if (statement.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
    return [];
  }
  const carrier = getRuntimeCarrierForExpression(input, statement.Expression, sourceFile);
  if (!isCsharpThrowableCarrier(carrier)) {
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Throw statements require finalized TSTS/provider exception-carrier facts before C# emission."));
    return [];
  }
  return [{
    kind: "ThrowStatement",
    expression: planExpression(statement.Expression, sourceFile, input, diagnostics),
  }];
}

export function planDebuggerStatement(): readonly CsharpStatement[] {
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
}

export function planExpressionStatement(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  if (isErasedAttributeExpressionStatement(node, input)) {
    return [];
  }
  if (HasSourceKind(input.ast, AsExpressionStatement(node)!.Expression, KindVoidExpression)) {
    const voidExpression = AsVoidExpression(AsExpressionStatement(node)!.Expression!)!;
    return [expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics)))];
  }
  return [expressionStatement(planDiscardedExpression(planExpression(AsExpressionStatement(node)!.Expression!, sourceFile, input, diagnostics)))];
}
