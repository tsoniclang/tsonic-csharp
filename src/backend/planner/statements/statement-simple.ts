import type { CsharpPlanningContext } from "../context.js";
import {
  AsBreakStatement,
  AsBinaryExpression,
  AsContinueStatement,
  AsExpressionStatement,
  AsParenthesizedExpression,
  AsReturnStatement,
  AsThrowStatement,
  AsVoidExpression,
  HasSourceKind,
  KindVoidExpression,
  Node_Text,
} from "@tsonic/target-api/source";
import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpStatement,
} from "../../roslyn/syntax.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  isErasedAttributeExpressionStatement,
} from "../declarations/attributes.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  isDestructuringAssignmentExpression,
  planDestructuringAssignmentStatement,
} from "../bindings/destructuring-assignment.js";
import {
  planExpression,
  planExpressionWithExpectedType,
} from "../expressions/index.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
  resolveRuntimeCarrierForStorage,
} from "../types/runtime-carriers.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../../options/csharp-target-options.js";
import {
  csharpThrownValueFromExpression,
  isExactUnmodifiedCatchRethrow,
  isCsharpCompatThrowableValueCarrier,
} from "../expressions/exception-flow.js";
import {
  findControlLabel,
} from "./statement-labels.js";
import {
  createDestructuringPlannerState,
} from "../bindings/binding-state.js";
import {
  expressionStatement,
  isCsharpThrowableCarrier,
  isVoidCsharpType,
  planDiscardedExpression,
  planExplicitlyDiscardedExpression,
} from "./statement-output.js";
import {
  directSourceYieldExpression,
  convertCsharpYieldResumeExpression,
  planCsharpYieldValue,
  planDiscardedCsharpYield,
} from "./statement-yield.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  isCsharpGeneratorReturnInsideFinally,
} from "./generators.js";
import {
  isErasedSafetyExpressionStatement,
} from "../safety/explicit-safety.js";

export function planReturnStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statement = AsReturnStatement(input.ast, node)!;
  if (state.generator !== undefined) {
    const returnType = csharpTypeFromTargetTypeRef(
      state.generator.protocol.returnType,
    );
    if (returnType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "The exact generator return type has no closed C# source representation.",
      ));
      return [];
    }
    if (isCsharpGeneratorReturnInsideFinally(node, state.generator.declaration, input)) {
      diagnostics.push({
        code: "CSHARP_UNSUPPORTED_GENERATOR_RETURN_REGION",
        category: "error",
        source: "tsonic-csharp",
        message: "C# native iterators cannot leave a finally clause through a generator return.",
      });
      return [];
    }
    const directYield = directSourceYieldExpression(statement.Expression, input);
    const yieldPlan = directYield === undefined
      ? undefined
      : planCsharpYieldValue(
          directYield,
          sourceFile,
          input,
          diagnostics,
          state,
        );
    const expression = yieldPlan !== undefined && directYield !== undefined
      ? convertCsharpYieldResumeExpression(
          directYield,
          yieldPlan,
          state.generator.protocol.returnType,
          sourceFile,
          input,
          diagnostics,
        )
      : statement.Expression === undefined
      ? {
          kind: "DefaultExpression" as const,
          type: returnType,
          nullForgiving: true,
        }
      : planExpressionWithExpectedType(
          statement.Expression,
          sourceFile,
          input,
          diagnostics,
          returnType,
          statement.Expression,
          state,
          state.generator.protocol.returnType,
        );
    if (expression === undefined) {
      return [];
    }
    return [
      ...(yieldPlan?.statements ?? []),
      expressionStatement({
        kind: "AssignmentExpression",
        left: {
          kind: "IdentifierName",
          name: state.generator.returnValueName,
        },
        operatorToken: { kind: "EqualsToken" },
        right: expression,
      }),
      { kind: "GotoStatement", label: state.generator.exitLabel },
    ];
  }
  if (
    HasSourceKind(input.ast, statement.Expression, KindVoidExpression) &&
    state.currentReturnType !== undefined &&
    isVoidCsharpType(state.currentReturnType)
  ) {
    const voidExpression = AsVoidExpression(input.ast, statement.Expression)!;
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
  const statement = AsBreakStatement(ast, node)!;
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
  const statement = AsContinueStatement(ast, node)!;
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statement = AsThrowStatement(input.ast, node)!;
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): readonly CsharpStatement[] {
  if (
    isErasedAttributeExpressionStatement(node, input) ||
    isErasedSafetyExpressionStatement(node, input)
  ) {
    return [];
  }
  const expression = AsExpressionStatement(input.ast, node)!.Expression;
  const directYield = state === undefined || expression === undefined
    ? undefined
    : directSourceYieldExpression(expression, input);
  if (directYield !== undefined) {
    return planDiscardedCsharpYield(
      directYield,
      sourceFile,
      input,
      diagnostics,
      state!,
    );
  }
  if (
    state?.generator !== undefined &&
    expression !== undefined &&
    input.ast.is.IsBinaryExpression(expression)
  ) {
    const binary = AsBinaryExpression(input.ast, expression);
    const rightYield = directSourceYieldExpression(binary?.Right, input);
    if (
      rightYield !== undefined &&
      binary?.Left !== undefined &&
      input.ast.is.IsIdentifier(binary.Left)
    ) {
      const yieldPlan = planCsharpYieldValue(
        rightYield,
        sourceFile,
        input,
        diagnostics,
        state,
      );
      if (yieldPlan === undefined) {
        return [];
      }
      state.expressionOverrides.set(rightYield, yieldPlan.resumeExpression);
      const planned = planExpression(expression, sourceFile, input, diagnostics, state);
      state.expressionOverrides.delete(rightYield);
      return planned === undefined
        ? []
        : [...yieldPlan.statements, expressionStatement(planDiscardedExpression(planned))];
    }
  }
  const assignmentExpression = destructuringAssignmentExpressionStatementExpression(expression, input.ast);
  if (isDestructuringAssignmentExpression(assignmentExpression, input)) {
    return planDestructuringAssignmentStatement(assignmentExpression, sourceFile, input, diagnostics, state ?? createDestructuringPlannerState(assignmentExpression, input.ast), planExpression, planExpressionWithExpectedType) ?? [];
  }
  if (HasSourceKind(input.ast, expression, KindVoidExpression)) {
    const voidExpression = AsVoidExpression(input.ast, expression!)!;
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
  ast: AstReader,
): Node | undefined {
  return AsParenthesizedExpression(ast, expression)?.Expression ?? expression;
}
