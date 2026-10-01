import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpGenericOptionalParts, getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";

export function runtimeUnionArmProjection(
  baseExpression: CsharpExpression,
  armIndex: number,
  carrier?: TargetTypeRef,
  retainsAbsence = false,
): CsharpExpression {
  if (retainsAbsence) return { kind: "InvocationExpression",
    callee: { kind: "ConditionalAccessExpression", receiver: baseExpression, name: `As${armIndex + 1}` }, arguments: [] };
  const optional = getCsharpGenericOptionalParts(carrier);
  const receiver: CsharpExpression = getCsharpNullableElementTargetType(carrier) === undefined
    ? baseExpression
    : { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "PostfixUnaryExpression", operand: baseExpression, operatorToken: { kind: "ExclamationToken" } },
        name: "Value" };
  return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression",
      receiver: optional === undefined ? receiver : { kind: "IdentifierName", name: optional.operations.name },
      name: `As${armIndex + 1}` },
    arguments: optional === undefined ? [] : [{ kind: "Argument", expression: baseExpression }],
  };
}

export function runtimeUnionArmTest(
  baseExpression: CsharpExpression,
  armIndex: number,
  carrier?: TargetTypeRef,
): CsharpExpression {
  const optional = getCsharpGenericOptionalParts(carrier);
  const nullable = getCsharpNullableElementTargetType(carrier) !== undefined;
  const test: CsharpExpression = { kind: "InvocationExpression",
    callee: { kind: nullable ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
      receiver: optional === undefined ? baseExpression : { kind: "IdentifierName", name: optional.operations.name },
      name: `Is${armIndex + 1}` },
    arguments: optional === undefined ? [] : [{ kind: "Argument", expression: baseExpression }],
  };
  return nullable ? { kind: "BinaryExpression", left: test, operatorToken: { kind: "EqualsEqualsToken" },
    right: { kind: "LiteralExpression", value: true } } : test;
}
