import type { CsharpExpression } from "../roslyn/syntax.js";

export function invalidExpression(reason: string): CsharpExpression {
  return { kind: "InvalidExpression", reason };
}
