import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { isCsharpNeverTargetType } from "../../../target-model/types/scalar-types.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";

export type CsharpPlannedCompletion =
  | { readonly kind: "value"; readonly carrier: TargetTypeRef; readonly expression: CsharpExpression }
  | { readonly kind: "void"; readonly carrier: TargetTypeRef }
  | { readonly kind: "never"; readonly carrier: TargetTypeRef };

export interface CsharpPlannedValue {
  readonly prelude: readonly CsharpStatement[];
  readonly completion: CsharpPlannedCompletion;
}

export interface CsharpPlannedEffectOperand {
  readonly kind: "effect";
  readonly effect: CsharpPlannedValue;
}

export type CsharpPlannedOperand = CsharpPlannedValue | CsharpPlannedEffectOperand;

export interface CsharpPlannedArgument extends CsharpPlannedValue {
  readonly passing?: CsharpArgument["passing"];
  readonly suspends?: true;
  readonly nativeLocation?: Extract<import("../../../analysis/storage/native-locations.js").CsharpNativeLocationSelection, { readonly kind: "resolved" }>;
}

export interface CsharpPlannedCapture {
  readonly name: string;
  readonly type: CsharpTypeNode;
}

export interface CsharpPlannedLocationCapture {
  readonly kind: "native-location";
  readonly expression: CsharpExpression;
  readonly prelude?: readonly CsharpStatement[];
}

export function csharpPlannedValue(
  carrier: TargetTypeRef,
  expression: CsharpExpression,
  prelude: readonly CsharpStatement[] = [],
): CsharpPlannedValue {
  if (isCsharpVoidTargetType(carrier) || isCsharpNeverTargetType(carrier))
    throw new Error("A native void or never completion cannot be planned as a value.");
  return Object.freeze({ prelude: Object.freeze([...prelude]),
    completion: Object.freeze({ kind: "value", carrier, expression }) });
}

export function csharpPlannedEffect(
  carrier: TargetTypeRef,
  prelude: readonly CsharpStatement[],
): CsharpPlannedValue | undefined {
  const kind = isCsharpNeverTargetType(carrier) ? "never" : isCsharpVoidTargetType(carrier) ? "void" : undefined;
  return kind === undefined ? undefined : Object.freeze({ prelude: Object.freeze([...prelude]),
    completion: Object.freeze({ kind, carrier }) });
}

export function mapCsharpPlannedValue(
  planned: CsharpPlannedValue | undefined,
  carrier: TargetTypeRef,
  project: (expression: CsharpExpression) => CsharpExpression | undefined,
): CsharpPlannedValue | undefined {
  if (planned === undefined) return undefined;
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind === "void") return isCsharpVoidTargetType(carrier) ? planned : undefined;
  const expression = project(planned.completion.expression);
  return expression === undefined ? undefined : csharpPlannedValue(carrier, expression, planned.prelude);
}

export function sequenceCsharpPlannedValues(
  operands: readonly CsharpPlannedOperand[],
  capture: (carrier: TargetTypeRef, operand: CsharpPlannedValue) => CsharpPlannedCapture | CsharpPlannedLocationCapture | undefined,
  complete: (expressions: readonly CsharpExpression[]) => CsharpPlannedValue | undefined,
): CsharpPlannedValue | undefined {
  const preludesAfter: boolean[] = [];
  let subsequentPrelude = false;
  for (let index = operands.length - 1; index >= 0; index -= 1) {
    preludesAfter[index] = subsequentPrelude;
    const selected = operands[index]!;
    const operand = "kind" in selected ? selected.effect : selected;
    subsequentPrelude ||= operand.prelude.length > 0 || operand.completion.kind !== "value";
  }
  const prelude: CsharpStatement[] = [];
  const expressions: CsharpExpression[] = [];
  for (const [index, entry] of operands.entries()) {
    const operand = "kind" in entry ? entry.effect : entry;
    if ("kind" in entry && operand.completion.kind === "value") return undefined;
    prelude.push(...operand.prelude);
    if (operand.completion.kind === "never") return csharpPlannedEffect(operand.completion.carrier, prelude);
    if ("kind" in entry) continue;
    if (operand.completion.kind !== "value") return undefined;
    const expression = operand.completion.expression;
    if (!preludesAfter[index] || csharpPlannedExpressionIsStable(expression)) {
      expressions.push(expression);
      continue;
    }
    const selected = capture(operand.completion.carrier, operand);
    if (selected === undefined) return undefined;
    if ("kind" in selected) {
      prelude.push(...selected.prelude ?? []);
      expressions.push(selected.expression);
      continue;
    }
    prelude.push({ kind: "LocalDeclarationStatement", name: selected.name, type: selected.type, initializer: expression });
    expressions.push({ kind: "IdentifierName", name: selected.name });
  }
  const result = complete(expressions);
  return result === undefined ? undefined : Object.freeze({
    prelude: Object.freeze([...prelude, ...result.prelude]), completion: result.completion,
  });
}

export function planCsharpPlannedBranch(
  condition: CsharpPlannedValue,
  consequent: CsharpPlannedValue,
  alternative: CsharpPlannedValue,
  carrier: TargetTypeRef,
  result: CsharpPlannedCapture | undefined,
): CsharpPlannedValue | undefined {
  if (condition.completion.kind === "never") return condition;
  if (condition.completion.kind !== "value") return undefined;
  if (consequent.prelude.length === 0 && alternative.prelude.length === 0 &&
    consequent.completion.kind === "value" && alternative.completion.kind === "value") {
    return csharpPlannedValue(carrier, { kind: "ConditionalExpression", condition: condition.completion.expression,
      whenTrue: consequent.completion.expression, whenFalse: alternative.completion.expression }, condition.prelude);
  }
  const valued = !isCsharpVoidTargetType(carrier) && !isCsharpNeverTargetType(carrier);
  if (valued && result === undefined) return undefined;
  const assign = (branch: CsharpPlannedValue): readonly CsharpStatement[] | undefined => {
    if (branch.completion.kind === "never") return branch.prelude;
    if (branch.completion.kind === "void") return valued ? undefined : branch.prelude;
    if (!valued || result === undefined) return undefined;
    return [...branch.prelude, { kind: "ExpressionStatement", expression:
      { kind: "AssignmentExpression", left: { kind: "IdentifierName", name: result.name },
        operatorToken: { kind: "EqualsToken" }, right: branch.completion.expression } }];
  };
  const thenStatements = assign(consequent);
  const elseStatements = assign(alternative);
  if (thenStatements === undefined || elseStatements === undefined) return undefined;
  const prelude: CsharpStatement[] = [...condition.prelude,
    ...(valued ? [{ kind: "LocalDeclarationStatement" as const, name: result!.name, type: result!.type }] : []),
    { kind: "IfStatement", condition: condition.completion.expression,
      thenBody: { kind: "Block", statements: thenStatements }, elseBody: { kind: "Block", statements: elseStatements } }];
  return valued ? csharpPlannedValue(carrier, { kind: "IdentifierName", name: result!.name }, prelude)
    : csharpPlannedEffect(carrier, prelude);
}

export function csharpPlannedExpressionIsStable(expression: CsharpExpression): boolean {
  let selected = expression;
  let budget = 2048;
  while (selected.kind === "ParenthesizedExpression") {
    if (budget-- === 0) return false;
    selected = selected.expression;
  }
  switch (selected.kind) {
    case "LiteralExpression":
    case "NumericLiteralExpression":
    case "IntegerLiteralExpression":
    case "CharacterLiteralExpression":
    case "DefaultExpression":
      return true;
    default:
      return false;
  }
}
