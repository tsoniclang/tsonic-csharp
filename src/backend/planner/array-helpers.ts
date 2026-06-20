import type { CsharpArgument, CsharpExpression } from "../ast/csharp-ast.js";

export function runtimeArrayHelperCall(name: string, args: readonly CsharpArgument[]): CsharpExpression {
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
            left: {
              kind: "qualified",
              left: { kind: "named", name: "Tsonic" },
              name: "CSharp",
            },
            name: "Runtime",
          },
          name: "ArrayHelpers",
        },
      },
      name,
    },
    arguments: args,
  };
}
