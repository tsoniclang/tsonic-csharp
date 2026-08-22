import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api/artifacts";
import type {
  CsharpJsValueOperationSelection,
} from "../../../analysis/operations/index.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpTsValueTargetType,
  isCsharpJsValueTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  planCsharpExactLiteralConversion,
} from "./literal-conversions.js";

export function planCsharpJsValueBox(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  if (sourceType !== undefined && isCsharpJsValueTargetType(sourceType)) {
    return expression;
  }
  let sourceExpression = expression;
  const literal = planCsharpExactLiteralConversion(input, node, sourceType);
  if (literal.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, literal.reason));
    return undefined;
  }
  if (literal.kind === "resolved") {
    sourceExpression = literal.expression;
  } else if (
    sourceType?.kind === "source-primitive" &&
    (input.program.source.ast.is.IsNumericLiteral(node) || input.program.source.ast.is.IsPrefixUnaryExpression(node))
  ) {
    const type = csharpTypeFromTargetTypeRef(sourceType);
    if (type === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "A source primitive entering the closed JS-value carrier requires its exact renderable C# representation.",
      ));
      return undefined;
    }
    sourceExpression = {
      kind: "CastExpression",
      type,
      expression,
    };
  }
  const type = csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "from",
        },
        arguments: [{ kind: "Argument", expression: sourceExpression }],
      };
}

export function translateCsharpJsValueInvocation(
  selection: Extract<
    CsharpJsValueOperationSelection,
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

export function translateCsharpJsValueFactory(
  expression: CsharpExpression,
): CsharpExpression {
  return {
    kind: "LambdaExpression",
    parameters: [],
    body: expression,
  };
}

export function translateCsharpJsValueArgumentFactory(
  arguments_: readonly CsharpExpression[],
): CsharpExpression {
  return translateCsharpJsValueFactory({
    kind: "ArrayCreationExpression",
    elementType: {
      kind: "NullableType",
      inner: { kind: "PredefinedType", name: "object" },
    },
    elements: arguments_,
  });
}
