import type { CsharpPlanningContext } from "../context.js";
import {
  AsBreakStatement,
  AsBinaryExpression,
  AsContinueStatement,
  AsExpressionStatement,
  AsParenthesizedExpression,
  AsReturnStatement,
  AsThrowStatement,
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
} from "../../target-ast/roslyn/index.js";
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
} from "../types/runtime-carriers.js";
import {
  csharpThrownValueFromExpression,
  isExactUnmodifiedCatchRethrow,
} from "../expressions/exception-flow.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/index.js";
import {
  findControlLabel,
} from "./statement-labels.js";
import {
  createDestructuringPlannerState,
} from "../bindings/binding-state.js";
import {
  expressionStatement,
  planCsharpVoidReturn,
  planCsharpAbsenceReturn,
  consumeCsharpPlannedValue,
  planCsharpPlannedDiscard,
} from "./statement-output.js";
import { planCsharpExpressionCompletion } from "../expressions/planned-value-composition.js";
import { csharpVoidReturnCompletion } from "../../../target-model/types/index.js";
import {
  convertCsharpYieldResumeExpression,
  planCsharpYieldValue,
  planDiscardedCsharpYield,
} from "./statement-yield.js";
import {
  directCsharpSourceYieldExpression,
} from "../../../target-model/syntax/yield-expression.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
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
  const statement = AsReturnStatement(input.program.source.ast, node)!;
  if (state.generator !== undefined) {
    const returnType = csharpTypeFromTargetTypeRef(
      state.generator.protocol.returnType, input.scope.typeParameterNames,
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
    const directYield = directCsharpSourceYieldExpression(
      input.program.source.ast,
      statement.Expression,
    );
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
      ? planCsharpExpressionCompletion(directYield, sourceFile, input, diagnostics, convertCsharpYieldResumeExpression(
          directYield,
          yieldPlan,
          state.generator.protocol.returnType,
          sourceFile,
          input,
          diagnostics,
        ), state.generator.protocol.returnType)
      : statement.Expression === undefined
      ? planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, {
          kind: "DefaultExpression" as const,
          type: returnType,
          nullForgiving: true,
        }, state.generator.protocol.returnType)
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
    const generator = state.generator;
    return [
      ...(yieldPlan?.statements ?? []),
      ...consumeCsharpPlannedValue(expression, value => [expressionStatement({
        kind: "AssignmentExpression",
        left: {
          kind: "IdentifierName",
          name: generator.returnValueName,
        },
        operatorToken: { kind: "EqualsToken" },
        right: value,
      }),
      { kind: "GotoStatement", label: generator.exitLabel },
    ])];
  }
  const expectedReturnExpressionType = state.currentReturnExpressionType ?? state.currentReturnType;
  const expectedReturnExpressionTypeSubject = state.currentReturnExpressionTypeSubject ?? state.currentReturnTypeSubject;
  const expectedReturnExpressionTargetType = state.currentReturnExpressionTargetType;
  const completion = statement.Expression === undefined ? undefined : csharpVoidReturnCompletion(
    input.types.classifications.resolveNode(statement.Expression, sourceFile), expectedReturnExpressionTargetType);
  if (completion !== undefined && statement.Expression !== undefined) {
    const value = planExpression(statement.Expression, sourceFile, input, diagnostics, state);
    return value === undefined ? [] : planCsharpVoidReturn(value, completion, expectedReturnExpressionTargetType, input.scope.typeParameterNames);
  }
  if (statement.Expression === undefined && state.currentUndefinedReturn) {
    return [planCsharpAbsenceReturn(expectedReturnExpressionTargetType, input.scope.typeParameterNames)];
  }
  const expression = statement.Expression === undefined
    ? undefined
    : expectedReturnExpressionType === undefined
      ? planExpression(statement.Expression, sourceFile, input, diagnostics, state)
      : planExpressionWithExpectedType(statement.Expression, sourceFile, input, diagnostics, expectedReturnExpressionType, expectedReturnExpressionTypeSubject, state, expectedReturnExpressionTargetType);
  if (statement.Expression !== undefined && expression === undefined) {
    return [];
  }
  return expression === undefined ? [{ kind: "ReturnStatement" }]
    : consumeCsharpPlannedValue(expression, value => [{ kind: "ReturnStatement", expression: value }],
      () => [{ kind: "ReturnStatement" }]);
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
    target.breakUsed = true;
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
    target.continueUsed = true;
    const region = [...state.loopContinuations].reverse().find(region => region.loop === target.loop);
    if (region?.label !== undefined) {
      region.used = true;
      return [{ kind: "GotoStatement", label: region.label }];
    }
    return [{ kind: "GotoStatement", label: target.continueLabel }];
  }
  const region = state.loopContinuations[state.loopContinuations.length - 1];
  if (region?.label !== undefined) {
    region.used = true;
    return [{ kind: "GotoStatement", label: region.label }];
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
  const statement = AsThrowStatement(input.program.source.ast, node)!;
  if (statement.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Throw statement must have an expression."));
    return [];
  }
  const sourceExpression = statement.Expression;
  if (isExactUnmodifiedCatchRethrow(node, statement.Expression, input)) {
    return [{ kind: "ThrowStatement" }];
  }
  const carrierResolution = resolveRuntimeCarrierForExpression(
    input,
    statement.Expression,
    sourceFile,
  );
  const carrier = probeCarrierFromResolution(carrierResolution);
  const thrown = input.program.operations.throwValue(node);
  if (thrown === undefined || thrown.expression !== statement.Expression ||
    (carrier === undefined ? thrown.sourceCarrier !== undefined
      : thrown.sourceCarrier === undefined || !targetTypeRefEquals(thrown.sourceCarrier, carrier))) {
    diagnostics.push(unsupportedNodeDiagnostic(
      statement.Expression,
      "Throw expression has no exact sealed C# native error carrier classification.",
    ));
    return [];
  }
  if (thrown.targetCarrier === undefined) {
    const detail = carrier === undefined
      ? missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the thrown expression.")
      : { reason: "Resolved thrown expression carrier is not a target throwable carrier.", evidence: [] };
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, `Throw statements require finalized TSTS/provider exception-carrier facts before C# emission. ${detail.reason}`, detail.evidence));
    return [];
  }
  const type = csharpTypeFromTargetTypeRef(thrown.targetCarrier, input.scope.typeParameterNames);
  const expression = type === undefined ? undefined : planExpressionWithExpectedType(statement.Expression, sourceFile,
    input, diagnostics, type, statement.Expression, state, thrown.targetCarrier);
  if (expression === undefined) {
    return [];
  }
  return consumeCsharpPlannedValue(expression, value => {
    const native = isCsharpJsValueTargetType(thrown.targetCarrier) ? csharpThrownValueFromExpression(value) : value;
    if (native === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(sourceExpression,
        "Throw statements require a renderable closed TsThrownValueException carrier before C# emission."));
      return [];
    }
    return [{ kind: "ThrowStatement", expression: native }];
  });
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
  const expression = AsExpressionStatement(input.program.source.ast, node)!.Expression;
  if (expression !== undefined && input.program.sourceEvidence.isCompileTimeMetadata(expression)) return [];
  const directYield = state === undefined || expression === undefined
    ? undefined
    : directCsharpSourceYieldExpression(input.program.source.ast, expression);
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
    input.program.source.ast.is.IsBinaryExpression(expression)
  ) {
    const binary = AsBinaryExpression(input.program.source.ast, expression);
    const rightYield = directCsharpSourceYieldExpression(
      input.program.source.ast,
      binary?.Right,
    );
    if (
      rightYield !== undefined &&
      binary?.Left !== undefined &&
      input.program.source.ast.is.IsIdentifier(binary.Left)
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
        : [...yieldPlan.statements, ...planCsharpPlannedDiscard(planned)];
    }
  }
  const assignmentExpression = destructuringAssignmentExpressionStatementExpression(expression, input.program.source.ast);
  if (isDestructuringAssignmentExpression(assignmentExpression, input)) {
    return planDestructuringAssignmentStatement(assignmentExpression, sourceFile, input, diagnostics, state ?? createDestructuringPlannerState(assignmentExpression, input.program.source.ast), planExpression, planExpressionWithExpectedType) ?? [];
  }
  const planned = planExpression(expression!, sourceFile, input, diagnostics, state);
  return planned === undefined ? [] : planCsharpPlannedDiscard(planned);
}

function destructuringAssignmentExpressionStatementExpression(
  expression: Node | undefined,
  ast: AstReader,
): Node | undefined {
  return AsParenthesizedExpression(ast, expression)?.Expression ?? expression;
}
