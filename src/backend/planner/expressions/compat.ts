import type {
  CsharpCompatAnySelection,
} from "../../../policy/compat/index.js";
import {
  csharpTsValueTargetType,
} from "../../../policy/types/index.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

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

export function translateCsharpCompatValueFactory(
  expression: CsharpExpression,
): CsharpExpression {
  return {
    kind: "LambdaExpression",
    parameters: [],
    body: expression,
  };
}

export function translateCsharpCompatArgumentFactory(
  arguments_: readonly CsharpExpression[],
): CsharpExpression {
  return translateCsharpCompatValueFactory({
    kind: "ArrayCreationExpression",
    elementType: {
      kind: "NullableType",
      inner: { kind: "PredefinedType", name: "object" },
    },
    elements: arguments_,
  });
}
