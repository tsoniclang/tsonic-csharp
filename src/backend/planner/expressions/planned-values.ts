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

export interface CsharpPlannedArgument {
  readonly prelude: readonly CsharpStatement[];
  readonly argument: CsharpArgument;
  readonly carrier: TargetTypeRef;
}

export interface CsharpPlannedCapture {
  readonly name: string;
  readonly type: CsharpTypeNode;
}

export function csharpPlannedValue(
  carrier: TargetTypeRef,
  expression: CsharpExpression,
  prelude: readonly CsharpStatement[] = [],
): CsharpPlannedValue {
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
  operands: readonly CsharpPlannedValue[],
  capture: (carrier: TargetTypeRef) => CsharpPlannedCapture | undefined,
  complete: (expressions: readonly CsharpExpression[]) => CsharpPlannedValue | undefined,
): CsharpPlannedValue | undefined {
  const preludesAfter: boolean[] = [];
  let subsequentPrelude = false;
  for (let index = operands.length - 1; index >= 0; index -= 1) {
    preludesAfter[index] = subsequentPrelude;
    const operand = operands[index]!;
    subsequentPrelude ||= operand.prelude.length > 0 || operand.completion.kind !== "value";
  }
  const prelude: CsharpStatement[] = [];
  const expressions: CsharpExpression[] = [];
  for (const [index, operand] of operands.entries()) {
    prelude.push(...operand.prelude);
    if (operand.completion.kind === "never") return csharpPlannedEffect(operand.completion.carrier, prelude);
    if (operand.completion.kind !== "value") return undefined;
    const expression = operand.completion.expression;
    if (!preludesAfter[index] || csharpPlannedExpressionIsStable(expression)) {
      expressions.push(expression);
      continue;
    }
    const selected = capture(operand.completion.carrier);
    if (selected === undefined) return undefined;
    prelude.push({ kind: "LocalDeclarationStatement", name: selected.name, type: selected.type, initializer: expression });
    expressions.push({ kind: "IdentifierName", name: selected.name });
  }
  const result = complete(expressions);
  return result === undefined ? undefined : Object.freeze({
    prelude: Object.freeze([...prelude, ...result.prelude]), completion: result.completion,
  });
}

export function selectCsharpPlannedBranch(
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

function csharpPlannedExpressionIsStable(expression: CsharpExpression): boolean {
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
