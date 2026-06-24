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
  isDestructuringAssignmentExpression,
  pushMissingDestructuringAssignmentFactsDiagnostic,
} from "./destructuring-assignment.js";
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
      expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics, state))),
      { kind: "ReturnStatement" },
    ];
  }
  const expectedReturnExpressionType = state.currentReturnExpressionType ?? state.currentReturnType;
  const expectedReturnExpressionTypeSubject = state.currentReturnExpressionTypeSubject ?? state.currentReturnTypeSubject;
  return [{
    kind: "ReturnStatement",
    ...(statement.Expression !== undefined
      ? {
          expression: expectedReturnExpressionType === undefined
            ? planExpression(statement.Expression, sourceFile, input, diagnostics, state)
            : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, expectedReturnExpressionType, expectedReturnExpressionTypeSubject, state),
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
  state?: DestructuringPlannerState,
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
    expression: planExpression(statement.Expression, sourceFile, input, diagnostics, state),
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
  state?: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (isErasedAttributeExpressionStatement(node, input)) {
    return [];
  }
  const expression = AsExpressionStatement(node)!.Expression;
  if (isDestructuringAssignmentExpression(expression, input)) {
    pushMissingDestructuringAssignmentFactsDiagnostic(expression!, diagnostics);
    return [];
  }
  if (HasSourceKind(input.ast, expression, KindVoidExpression)) {
    const voidExpression = AsVoidExpression(expression!)!;
    return [expressionStatement(planDiscardedExpression(planExpression(voidExpression.Expression!, sourceFile, input, diagnostics, state)))];
  }
  return [expressionStatement(planDiscardedExpression(planExpression(expression!, sourceFile, input, diagnostics, state)))];
}
