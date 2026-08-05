import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsBreakStatement,
  AsContinueStatement,
  AsExpressionStatement,
  AsParenthesizedExpression,
  AsReturnStatement,
  AsThrowStatement,
  AsVoidExpression,
  HasSourceKind,
  KindVoidExpression,
  Node_Text,
} from "./source-ast.js";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
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
  planDestructuringAssignmentStatement,
} from "./destructuring-assignment.js";
import {
  planExpression,
  planExpressionWithExpectedType,
} from "./expressions.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
  resolveRuntimeCarrierForStorage,
} from "./runtime-carriers.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import {
  csharpThrownValueFromExpression,
  isExactUnmodifiedCatchRethrow,
  isCsharpCompatThrowableValueCarrier,
} from "./exception-flow.js";
import {
  findControlLabel,
} from "./statement-labels.js";
import {
  createDestructuringPlannerState,
} from "./binding-state.js";
import {
  expressionStatement,
  isCsharpThrowableCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
  planExplicitlyDiscardedExpression,
} from "./statement-output.js";

export function planReturnStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
    const discardedType = input.types.resolveNode(
      voidExpression.Expression,
      sourceFile,
    );
    if (discardedType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        voidExpression.Expression!,
        "The explicit void operand has no closed C# target representation.",
      ));
      return [];
    }
    return [
      expressionStatement(
        planExplicitlyDiscardedExpression(discarded, discardedType),
      ),
      { kind: "ReturnStatement" },
    ];
  }
  const expectedReturnExpressionType = state.currentReturnExpressionType ?? state.currentReturnType;
  const expectedReturnExpressionTypeSubject = state.currentReturnExpressionTypeSubject ?? state.currentReturnTypeSubject;
  const expectedReturnExpressionTargetType = state.currentReturnExpressionTargetType;
  if (
    statement.Expression !== undefined &&
    state.observedReturnTargetTypes !== undefined
  ) {
    const observed = input.types.resolveNode(statement.Expression, sourceFile);
    if (observed === undefined) {
      state.returnTargetObservationIncomplete = true;
    } else {
      state.observedReturnTargetTypes.push(observed);
    }
  }
  const expression = statement.Expression === undefined
    ? undefined
    : expectedReturnExpressionType === undefined
      ? planExpression(statement.Expression, sourceFile, input, diagnostics, state)
      : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, expectedReturnExpressionType, expectedReturnExpressionTypeSubject, state, expectedReturnExpressionTargetType);
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
  ast: AstReader,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statement = AsBreakStatement(node)!;
  if (statement.Label !== undefined) {
    const target = findControlLabel(state, Node_Text(ast, statement.Label));
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
  ast: AstReader,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statement = AsContinueStatement(node)!;
  if (statement.Label !== undefined) {
    const target = findControlLabel(state, Node_Text(ast, statement.Label));
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statement = AsThrowStatement(node)!;
  if (statement.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
    return [];
  }
  const compatibilityMode = readCsharpTypescriptCompatibilityMode(input.target);
  const carrierResolution = compatibilityMode === "compat"
    ? resolveRuntimeCarrierForExpression(input, statement.Expression, sourceFile)
    : resolveRuntimeCarrierForStorage(input, statement.Expression, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (!isCsharpThrowableCarrier(carrier, input)) {
    if (compatibilityMode === "compat" && isCsharpCompatThrowableValueCarrier(carrier)) {
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
  if (
    compatibilityMode === "strict-native" &&
    isExactUnmodifiedCatchRethrow(node, statement.Expression, input)
  ) {
    return [{ kind: "ThrowStatement" }];
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (isErasedAttributeExpressionStatement(node, input)) {
    return [];
  }
  const expression = AsExpressionStatement(node)!.Expression;
  const assignmentExpression = destructuringAssignmentExpressionStatementExpression(expression);
  if (isDestructuringAssignmentExpression(assignmentExpression, input)) {
    return planDestructuringAssignmentStatement(assignmentExpression, sourceFile, input, diagnostics, state ?? createDestructuringPlannerState(assignmentExpression, input.ast), planExpression, planExpressionWithExpectedType) ?? [];
  }
  if (HasSourceKind(input.ast, expression, KindVoidExpression)) {
    const voidExpression = AsVoidExpression(expression!)!;
    const planned = planExpression(voidExpression.Expression!, sourceFile, input, diagnostics, state);
    const discardedType = input.types.resolveNode(
      voidExpression.Expression,
      sourceFile,
    );
    if (planned === undefined || discardedType === undefined) {
      if (planned !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(
          voidExpression.Expression!,
          "The explicit void operand has no closed C# target representation.",
        ));
      }
      return [];
    }
    return [expressionStatement(
      planExplicitlyDiscardedExpression(planned, discardedType),
    )];
  }
  const planned = planExpression(expression!, sourceFile, input, diagnostics, state);
  return planned === undefined ? [] : [expressionStatement(planDiscardedExpression(planned))];
}

function destructuringAssignmentExpressionStatementExpression(
  expression: Node | undefined,
): Node | undefined {
  return AsParenthesizedExpression(expression)?.Expression ?? expression;
}
