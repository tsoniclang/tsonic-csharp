import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  csharpTsValueTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
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
  if (!input.program.source.ast.is.IsVoidExpression(node)) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsVoidExpression(node)?.Expression;
  const jsValueOperation = input.program.operations.jsVoid(node);
  if (jsValueOperation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a void expression without a sealed operation classification.",
    ));
    return undefined;
  }
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
