import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
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
import { csharpPlannedEffect, csharpPlannedExpressionIsStable } from "../expressions/planned-values.js";
import { csharpVoidTargetType } from "../../../target-model/types/scalar-types.js";

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
  return consumeCsharpPlannedValue(planned, expression => csharpPlannedExpressionIsStable(expression) ? [] : [
    planCsharpDiscardedStatement(expression, planned.completion.carrier, explicit),
  ]);
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
    planCsharpPlannedDiscard(planned));
  return effect === undefined ? undefined : Object.freeze({ kind: "effect", effect });
}

export function planCsharpDiscardedStatement(
  expression: CsharpExpression,
  targetType: TargetTypeRef | undefined,
  explicit = false,
): CsharpStatement {
  if (isCsharpNeverTargetType(targetType)) {
    return { kind: "ThrowStatement", expression: planCsharpNeverValue(expression, qualifiedCsharpType("System", "Exception")) };
  }
  return expressionStatement(explicit && targetType !== undefined
    ? planExplicitlyDiscardedExpression(expression, targetType)
    : planDiscardedExpression(expression, targetType));
}

export function planCsharpAbsenceReturn(
  carrier: TargetTypeRef | undefined, typeParameterNames?: ReadonlyMap<string, string>,
): CsharpStatement {
  if (isCsharpVoidTargetType(carrier)) return { kind: "ReturnStatement" };
  const expression = carrier === undefined ? undefined : planCsharpAbsentValue(carrier, typeParameterNames);
  if (expression === undefined) throw new Error("An absence return requires its finalized native storage carrier.");
  return { kind: "ReturnStatement", expression };
}

export function planCsharpVoidReturn(
  planned: CsharpPlannedValue, completion: "void" | "absence",
  carrier?: TargetTypeRef, typeParameterNames?: ReadonlyMap<string, string>,
): readonly CsharpStatement[] {
  return [...planCsharpPlannedDiscard(planned), ...(
    planned.completion.kind === "never" ? [] : [
    completion === "absence" ? planCsharpAbsenceReturn(carrier, typeParameterNames) : { kind: "ReturnStatement" },
  ] as readonly CsharpStatement[])];
}

export function isVoidCsharpType(type: CsharpTypeNode): boolean {
  return type.kind === "PredefinedType" && type.name === "void";
}

export function planDiscardedExpression(
  expression: CsharpExpression,
  targetType: TargetTypeRef | undefined,
): CsharpExpression {
  const task = getCsharpTaskResultTargetType(getCsharpNullableElementTargetType(targetType) ?? targetType);
  return task === undefined && isValidCsharpExpressionStatement(expression)
    ? expression
    : discardAssignment(expression);
}

export function planExplicitlyDiscardedExpression(
  expression: CsharpExpression,
  targetType: TargetTypeRef,
): CsharpExpression {
  return isCsharpVoidTargetType(targetType)
    ? expression
    : discardAssignment(expression);
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

function discardAssignment(expression: CsharpExpression): CsharpExpression {
  return {
    kind: "AssignmentExpression",
    left: { kind: "IdentifierName", name: "_" },
    operatorToken: { kind: "EqualsToken" },
    right: expression,
  };
}
