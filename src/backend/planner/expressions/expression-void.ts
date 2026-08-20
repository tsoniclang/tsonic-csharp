import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpJsValueVoidOperation,
} from "../../../policy/js-value-operations/index.js";
import {
  csharpTsValueTargetType,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function planVoidExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.ast.is.IsVoidExpression(node)) {
    return undefined;
  }
  const operand = input.ast.as.AsVoidExpression(node)?.Expression;
  const jsValueOperation = selectCsharpJsValueVoidOperation(
    input,
    operand,
    sourceFile,
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const expression = operand === undefined
      ? undefined
      : planExpression(operand, sourceFile, input, diagnostics);
    return expression === undefined
      ? undefined
      : translateCsharpJsValueInvocation(
          jsValueOperation,
          undefined,
          [expression],
        );
  }
  const receiver = csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
  if (operand === undefined || receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# void translation requires an exact operand and closed TsValue carrier.",
    ));
    return undefined;
  }
  const expression = planExpression(operand, sourceFile, input, diagnostics);
  return expression === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver,
          name: "ApplyDynamicVoid",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}
