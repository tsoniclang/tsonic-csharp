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
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import {
  csharpThrownValueFromExpression,
  isCsharpCompatThrowableValueCarrier,
} from "./exception-flow.js";
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
    const discarded = planExpression(voidExpression.Expression!, sourceFile, input, diagnostics, state);
    if (discarded === undefined) {
      return [];
    }
    return [
      expressionStatement(planDiscardedExpression(discarded)),
      { kind: "ReturnStatement" },
    ];
  }
  const expectedReturnExpressionType = state.currentReturnExpressionType ?? state.currentReturnType;
  const expectedReturnExpressionTypeSubject = state.currentReturnExpressionTypeSubject ?? state.currentReturnTypeSubject;
  const expression = statement.Expression === undefined
    ? undefined
    : expectedReturnExpressionType === undefined
      ? planExpression(statement.Expression, sourceFile, input, diagnostics, state)
      : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, expectedReturnExpressionType, expectedReturnExpressionTypeSubject, state);
  if (statement.Expression !== undefined && expression === undefined) {
    return [];
  }
  return [{
    kind: "ReturnStatement",
    ...(expression !== undefined ? { expression } : {}),
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
  const carrierResolution = resolveRuntimeCarrierForExpression(input, statement.Expression, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (!isCsharpThrowableCarrier(carrier)) {
    if (readCsharpTypescriptCompatibilityMode(input.target) === "compat" && isCsharpCompatThrowableValueCarrier(carrier)) {
      const expression = planExpression(statement.Expression, sourceFile, input, diagnostics, state);
      const wrapped = expression === undefined ? undefined : csharpThrownValueFromExpression(expression);
      if (wrapped === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Throw statements require a renderable closed TsThrownValueException carrier before C# compatibility emission."));
        return [];
      }
      return [{
        kind: "ThrowStatement",
        expression: wrapped,
      }];
    }
    const detail = carrier === undefined
      ? missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the thrown expression.")
      : { reason: "Resolved thrown expression carrier is not a target throwable carrier.", evidence: [] };
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, `Throw statements require finalized TSTS/provider exception-carrier facts before C# emission. ${detail.reason}`, detail.evidence));
    return [];
  }
  const expression = planExpression(statement.Expression, sourceFile, input, diagnostics, state);
  if (expression === undefined) {
    return [];
  }
  return [{
    kind: "ThrowStatement",
    expression,
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
    const planned = planExpression(voidExpression.Expression!, sourceFile, input, diagnostics, state);
    return planned === undefined ? [] : [expressionStatement(planDiscardedExpression(planned))];
  }
  const planned = planExpression(expression!, sourceFile, input, diagnostics, state);
  return planned === undefined ? [] : [expressionStatement(planDiscardedExpression(planned))];
}
