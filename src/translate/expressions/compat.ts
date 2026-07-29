import type {
  CsharpCompatAnySelection,
} from "../../policy/compat/index.js";
import {
  csharpTsValueTargetType,
} from "../../policy/types/index.js";
import type {
  CsharpExpression,
} from "../../backend/roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";

export function translateCsharpCompatInvocation(
  selection: Extract<
    CsharpCompatAnySelection,
    { readonly kind: "resolved" }
  >,
  receiver: CsharpExpression | undefined,
  arguments_: readonly CsharpExpression[],
): CsharpExpression | undefined {
  const dispatchReceiver = selection.dispatch === "instance"
    ? receiver
    : csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
  return dispatchReceiver === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: dispatchReceiver,
          name: selection.runtimeMember,
        },
        arguments: arguments_.map((expression) => ({
          kind: "Argument",
          expression,
        })),
      };
}
