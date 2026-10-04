import {
  type Node,
} from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import {
  csharpExceptionTargetType,
  csharpTsThrownValueExceptionTargetType,
} from "../../../target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

export function csharpCatchExceptionType(): CsharpTypeNode | undefined {
  return csharpTypeFromTargetTypeRef(csharpExceptionTargetType(), undefined);
}

export function csharpThrownValueFromExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType(), undefined);
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "from",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}

export function csharpThrownValueToValueExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType(), undefined);
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "toValue",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}

export function isExactUnmodifiedCatchRethrow(
  throwStatement: Node,
  _expression: Node,
  input: CsharpPlanningContext,
): boolean {
  return input.program.operations.exactCatchRethrow(throwStatement);
}
