import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";

export type CsharpPlannedCompletion =
  | { readonly kind: "value"; readonly carrier: TargetTypeRef; readonly expression: CsharpExpression }
  | { readonly kind: "void"; readonly carrier: TargetTypeRef }
  | { readonly kind: "never"; readonly carrier: TargetTypeRef };

export interface CsharpPlannedValue {
  readonly prelude: readonly CsharpStatement[];
  readonly completion: CsharpPlannedCompletion;
  readonly constant?: true;
  readonly absent?: true;
  readonly address?: CsharpPlannedAddress;
  readonly receiverIdentity?: true;
  readonly callable?: CsharpPlannedCallable;
  readonly effect?: CsharpExpression;
}

export type CsharpPlannedCallable =
  | { readonly kind: "lambda"; readonly expression: Extract<CsharpExpression, { readonly kind: "LambdaExpression" }> }
  | { readonly kind: "method" }
  | { readonly kind: "stable-value" }
  | { readonly kind: "captured-method"; readonly receiver: CsharpExpression; readonly name: string };

export interface CsharpPlannedCallableReference {
  readonly expression: CsharpExpression;
  readonly callable?: CsharpPlannedCallable;
}

export interface CsharpPlannedAddressOperand {
  readonly expression: CsharpExpression;
  readonly address?: CsharpPlannedAddress;
  readonly receiverIdentity?: true;
}

export type CsharpPlannedAddress =
  | { readonly kind: "root" }
  | { readonly kind: "member"; readonly receiver: CsharpPlannedAddressOperand; readonly name: string; readonly static: boolean }
  | { readonly kind: "element"; readonly receiver: CsharpPlannedAddressOperand; readonly arguments: readonly CsharpExpression[] }
  | { readonly kind: "parenthesized"; readonly operand: CsharpPlannedAddressOperand };

export interface CsharpPlannedEffectOperand {
  readonly kind: "effect";
  readonly effect: CsharpPlannedValue;
}

export type CsharpPlannedOperand = CsharpPlannedValue | CsharpPlannedEffectOperand;

export interface CsharpPlannedArgument extends CsharpPlannedValue {
  readonly passing?: CsharpArgument["passing"];
  readonly suspends?: true;
  readonly nativeLocation?: Extract<import("../../../target-model/records/native/native-locations.js").CsharpNativeLocationSelection, { readonly kind: "resolved" }>;
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
  constant = false,
  absent = false,
): CsharpPlannedValue {
  return Object.freeze({ prelude: Object.freeze([...prelude]),
    ...(constant ? { constant: true as const } : {}),
    ...(absent ? { absent: true as const } : {}),
    completion: Object.freeze({ kind: "value", carrier, expression }) });
}

export function csharpPlannedEffect(
  carrier: TargetTypeRef,
  prelude: readonly CsharpStatement[],
  kind: "void" | "never" = "void",
): CsharpPlannedValue {
  return Object.freeze({ prelude: Object.freeze([...prelude]),
    completion: Object.freeze({ kind, carrier }) });
}

export function mapCsharpPlannedValue(
  planned: CsharpPlannedValue | undefined,
  carrier: TargetTypeRef,
  project: (expression: CsharpExpression) => CsharpExpression | undefined,
  constant = false,
): CsharpPlannedValue | undefined {
  if (planned === undefined) return undefined;
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind === "void") return undefined;
  const expression = project(planned.completion.expression);
  return expression === undefined ? undefined : csharpPlannedValue(carrier, expression, planned.prelude, constant);
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
    subsequentPrelude ||= operand.prelude.length > 0 || operand.completion.kind === "never";
  }
  const prelude: CsharpStatement[] = [];
  const expressions: CsharpExpression[] = [];
  for (const [index, entry] of operands.entries()) {
    const operand = "kind" in entry ? entry.effect : entry;
    if ("kind" in entry && operand.completion.kind === "value") return undefined;
    prelude.push(...operand.prelude);
    if (operand.completion.kind === "never") return csharpPlannedEffect(operand.completion.carrier, prelude, "never");
    if ("kind" in entry) continue;
    if (operand.completion.kind !== "value") return undefined;
    const expression = operand.completion.expression;
    if (!preludesAfter[index] || operand.constant === true) {
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
    ...result, effect: prelude.length === 0 ? result.effect : undefined, prelude: Object.freeze([...prelude, ...result.prelude]),
  });
}

export function planCsharpPlannedBranch(
  condition: CsharpPlannedValue,
  consequent: CsharpPlannedValue,
  alternative: CsharpPlannedValue,
  carrier: TargetTypeRef,
  result: CsharpPlannedCapture | undefined,
  completion: "value" | "void" | "never",
): CsharpPlannedValue | undefined {
  if (condition.completion.kind === "never") return condition;
  if (condition.completion.kind !== "value") return undefined;
  if (consequent.prelude.length === 0 && alternative.prelude.length === 0 &&
    consequent.completion.kind === "value" && alternative.completion.kind === "value") {
    return csharpPlannedValue(carrier, { kind: "ConditionalExpression", condition: condition.completion.expression,
      whenTrue: consequent.completion.expression, whenFalse: alternative.completion.expression }, condition.prelude);
  }
  const valued = completion === "value";
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
    : csharpPlannedEffect(carrier, prelude, completion === "never" ? "never" : "void");
}
