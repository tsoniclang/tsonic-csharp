import type { CsharpExpression } from "../../target-ast/roslyn/index.js";

export function csharpRecordOperation(name: "GetOrDefault" | "Set" | "Extend", arguments_: readonly CsharpExpression[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "RecordOperations", requiredUsingNamespace: "Tsonic.CSharp.Runtime" }, name },
    arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
}
