import type {
  CsharpBinaryOperatorToken,
  CsharpExpression,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { planCsharpDiscardedStatement } from "../statements/statement-output.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function callStatic(type: CsharpTypeNode, name: string, args: readonly CsharpExpression[]): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: type,
      name,
    },
    arguments: args.map((expression) => ({ kind: "Argument", expression })),
  };
}

export function assign(left: CsharpExpression, right: CsharpExpression): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "AssignmentExpression",
      left,
      operatorToken: { kind: "EqualsToken" },
      right,
    },
  };
}

export function and(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return binary(left, { kind: "AmpersandAmpersandToken" }, right);
}

export function lessThan(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return binary(left, { kind: "LessThanToken" }, right);
}

export function add(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return binary(left, { kind: "PlusToken" }, right);
}

export function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return {
    kind: "SimpleMemberAccessExpression",
    receiver,
    name,
  };
}

export function element(receiver: CsharpExpression, argument: CsharpExpression): CsharpExpression {
  return {
    kind: "ElementAccessExpression",
    receiver,
    arguments: [argument],
  };
}

export function literalNumber(value: number): CsharpExpression {
  return {
    kind: "LiteralExpression",
    value,
  };
}

export function evaluatedConstant(expression: CsharpExpression, carrier: TargetTypeRef,
  value: string | number | boolean | null, prelude: CsharpStatement[], evaluation: "evaluate" | "omit"): CsharpExpression {
  if (evaluation !== "evaluate" && evaluation !== "omit")
    failCsharpPlannerInvariant("A native constant result requires its exact operand evaluation fact.");
  if (evaluation === "evaluate") {
    const discarded = planCsharpDiscardedStatement(expression, carrier);
    if (discarded !== undefined) prelude.push(discarded);
  }
  return { kind: "LiteralExpression", value };
}

function binary(left: CsharpExpression, operatorToken: CsharpBinaryOperatorToken, right: CsharpExpression): CsharpExpression {
  return {
    kind: "BinaryExpression",
    left,
    operatorToken,
    right,
  };
}
