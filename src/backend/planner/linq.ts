import type { CsharpArgument, CsharpExpression } from "../ast/csharp-ast.js";

export function systemLinqEnumerableCall(name: string, args: readonly CsharpArgument[]): CsharpExpression {
  return {
    kind: "call",
    callee: {
      kind: "member",
      receiver: {
        kind: "type",
        type: {
          kind: "qualified",
          left: {
            kind: "qualified",
            left: { kind: "named", name: "System" },
            name: "Linq",
          },
          name: "Enumerable",
        },
      },
      name,
    },
    arguments: args,
  };
}
