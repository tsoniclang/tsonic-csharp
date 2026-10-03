import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";

export function planCsharpNeverValue(
  expression: CsharpExpression,
  type: CsharpTypeNode,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Value", typeArguments: [type] },
    arguments: [],
  };
}
