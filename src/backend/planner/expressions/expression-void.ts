import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../../options/csharp-target-options.js";
import {
  selectCsharpCompatAnyVoidOperation,
} from "../../../policy/compat/index.js";
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
  translateCsharpCompatInvocation,
} from "./compat.js";

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
  const compat = selectCsharpCompatAnyVoidOperation(
    input,
    operand,
    sourceFile,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const expression = operand === undefined
      ? undefined
      : planExpression(operand, sourceFile, input, diagnostics);
    return expression === undefined
      ? undefined
      : translateCsharpCompatInvocation(
          compat,
          undefined,
          [expression],
        );
  }
  if (readCsharpTypescriptCompatibilityMode(input.target) !== "compat") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "JavaScript void semantics require the explicit C# compatibility runtime.",
    ));
    return undefined;
  }
  const receiver = csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
  if (operand === undefined || receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# compatibility void translation requires an exact operand and closed TsValue carrier.",
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
          name: "ApplyCompatVoid",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}
