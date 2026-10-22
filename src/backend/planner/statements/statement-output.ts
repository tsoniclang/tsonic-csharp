import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import {
  isCsharpVoidTargetType,
  isCsharpNeverTargetType,
  getCsharpTaskResultTargetType,
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/index.js";
import { planCsharpAbsentValue } from "../expressions/optional-storage.js";
import { planCsharpNeverValue } from "../expressions/never-values.js";
import { qualifiedCsharpType } from "../types/index.js";
import type { CsharpPlannedValue, CsharpPlannedEffectOperand } from "../expressions/planned-values.js";
import { csharpPlannedEffect } from "../expressions/planned-values.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpPlanningContext } from "../context.js";

export function consumeCsharpPlannedValue(
  planned: CsharpPlannedValue,
  value: (expression: CsharpExpression) => readonly CsharpStatement[],
  voidCompletion: () => readonly CsharpStatement[] = () => [],
): readonly CsharpStatement[] {
  return [...planned.prelude, ...(
    planned.completion.kind === "value" ? value(planned.completion.expression)
      : planned.completion.kind === "void" ? voidCompletion() : []
  )];
}

export function planCsharpPlannedDiscard(
  planned: CsharpPlannedValue, explicit = false,
): readonly CsharpStatement[] {
  // A discarded native constant or absence value has no effect; only its prelude remains.
  if (planned.completion.kind === "value" && (planned.constant === true || planned.absent === true)) return planned.prelude;
  return consumeCsharpPlannedValue(planned, expression => {
    const statement = planCsharpDiscardedStatement(expression, planned.completion.carrier, explicit);
    return statement === undefined ? [] : [statement];
  });
}

export function expressionStatement(expression: CsharpExpression): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression,
  };
}

export function planCsharpDiscardedOperand(planned: CsharpPlannedValue | undefined): CsharpPlannedEffectOperand | undefined {
  if (planned === undefined) return undefined;
  const effect = csharpPlannedEffect(planned.completion.kind === "never" ? planned.completion.carrier : csharpVoidTargetType(),
    planCsharpPlannedDiscard(planned), planned.completion.kind === "never" ? "never" : "void");
  return effect === undefined ? undefined : Object.freeze({ kind: "effect", effect });
}

export function planCsharpDiscardedStatement(
  expression: CsharpExpression,
  targetType: TargetTypeRef | undefined,
  explicit = false,
): CsharpStatement | undefined {
  if (isCsharpNeverTargetType(targetType)) {
    return { kind: "ThrowStatement", expression: planCsharpNeverValue(expression, qualifiedCsharpType("System", "Exception")) };
  }
  const discarded = explicit && targetType !== undefined
    ? planExplicitlyDiscardedExpression(expression, targetType)
    : planDiscardedExpression(expression, targetType);
  return discarded === undefined ? undefined : expressionStatement(discarded);
}

export function planCsharpAbsenceReturn(
  carrier: TargetTypeRef | undefined, input: CsharpPlanningContext,
): CsharpStatement {
  if (isCsharpVoidTargetType(carrier)) return { kind: "ReturnStatement" };
  const expression = carrier === undefined ? undefined : planCsharpAbsentValue(carrier, input);
  if (expression === undefined) failCsharpPlannerInvariant("An absence return requires its finalized native storage carrier.");
  return { kind: "ReturnStatement", expression };
}

export function planCsharpVoidReturn(
  planned: CsharpPlannedValue, completion: "void" | "absence",
  carrier: TargetTypeRef | undefined, input: CsharpPlanningContext,
): readonly CsharpStatement[] {
  return [...planCsharpPlannedDiscard(planned), ...(
    planned.completion.kind === "never" ? [] : [
    completion === "absence" ? planCsharpAbsenceReturn(carrier, input) : { kind: "ReturnStatement" },
  ] as readonly CsharpStatement[])];
}

export function isVoidCsharpType(type: CsharpTypeNode): boolean {
  return type.kind === "PredefinedType" && type.name === "void";
}

export function planDiscardedExpression(
  expression: CsharpExpression,
  targetType: TargetTypeRef | undefined,
): CsharpExpression | undefined {
  const task = getCsharpTaskResultTargetType(getCsharpNullableElementTargetType(targetType) ?? targetType);
  return task === undefined && isValidCsharpExpressionStatement(expression)
    ? expression
    : discardAssignment(expression, targetType);
}

export function planExplicitlyDiscardedExpression(
  expression: CsharpExpression,
  targetType: TargetTypeRef,
): CsharpExpression | undefined {
  return isCsharpVoidTargetType(targetType)
    ? expression
    : discardAssignment(expression, targetType);
}

function isValidCsharpExpressionStatement(expression: CsharpExpression): boolean {
  switch (expression.kind) {
    case "AwaitExpression":
    case "InvocationExpression":
    case "ObjectCreationExpression":
    case "PostfixUnaryExpression":
      return true;
    case "PrefixUnaryExpression":
      return expression.operatorToken.kind === "PlusPlusToken" || expression.operatorToken.kind === "MinusMinusToken";
    case "AssignmentExpression":
      return true;
    default:
      return false;
  }
}

function discardAssignment(expression: CsharpExpression, carrier: TargetTypeRef | undefined): CsharpExpression {
  let selected = expression;
  while (selected.kind === "ParenthesizedExpression") selected = selected.expression;
  let value = expression;
  if (selected.kind === "LambdaExpression") {
    const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, undefined);
    if (type === undefined) failCsharpPlannerInvariant("Discarded native callable syntax requires its sealed delegate carrier.");
    value = { kind: "CastExpression", type, expression: { kind: "ParenthesizedExpression", expression } };
  }
  return {
    kind: "AssignmentExpression",
    left: { kind: "IdentifierName", name: "_" },
    operatorToken: { kind: "EqualsToken" },
    right: value,
  };
}
