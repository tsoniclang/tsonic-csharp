import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api/artifacts";
import type { CsharpJsValueInvocation } from "../../../target-model/operations/js-values.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpTsValueTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  planCsharpExactLiteralRecipe,
} from "./literal-conversions.js";

export function planCsharpJsValueBox(
  node: Node,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  if (sourceType === undefined) failCsharpPlannerInvariant("An admitted closed-value input requires its exact native carrier.", node);
  const selected = input.program.records.jsValueBoxing.get(node, sourceType)
    ?? failCsharpPlannerInvariant("An admitted closed-value input requires its sealed native boxing plan.", node);
  if (selected.kind === "identity") return expression;
  let sourceExpression = expression;
  if (selected.kind === "literal") {
    const literal = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selected.recipe);
    if (literal.kind !== "resolved") failCsharpPlannerInvariant("An admitted closed-value literal requires its native recipe.", node);
    sourceExpression = literal.expression;
  } else if (selected.kind === "cast") {
    const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames);
    if (type === undefined) {
      failCsharpPlannerInvariant("An admitted closed-value primitive requires its native representation.", node);
    }
    sourceExpression = {
      kind: "CastExpression",
      type,
      expression,
    };
  }
  const type = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted closed-value input requires its native runtime owner.", node);
  return {
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
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selection: CsharpJsValueInvocation,
  receiver: CsharpExpression | undefined,
  arguments_: readonly CsharpExpression[],
): CsharpExpression | undefined {
  const dispatchReceiver = selection.dispatch === "instance"
    ? receiver
    : csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), typeParameterNames);
  if (dispatchReceiver === undefined) failCsharpPlannerInvariant("An admitted closed-value invocation requires its native dispatch receiver.");
  return {
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
