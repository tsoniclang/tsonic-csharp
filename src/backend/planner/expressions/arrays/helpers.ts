import type { CsharpArgument, CsharpExpression } from "../../../roslyn/syntax.js";

export function runtimeArrayHelperCall(name: string, args: readonly CsharpArgument[]): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: {
        kind: "QualifiedName",
        left: {
          kind: "QualifiedName",
          left: {
            kind: "QualifiedName",
            left: { kind: "IdentifierName", name: "Tsonic" },
            name: "CSharp",
          },
          name: "Runtime",
        },
        name: "ArrayHelpers",
      },
      name,
    },
    arguments: args,
  };
}
