import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpInterpolatedStringPart,
} from "../../target-ast/roslyn/index.js";
import {
  AsTemplateExpression,
  AsTemplateSpan,
  Node_Text,
} from "@tsonic/target-api/source";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  requireCsharpStringRuntimeCarrier,
} from "./expression-literal-carriers.js";

export function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "Template string emission")) {
    return undefined;
  }
  const expression = AsTemplateExpression(input.program.source.ast, node)!;
  const parts: CsharpInterpolatedStringPart[] = [
    { kind: "InterpolatedStringText", text: Node_Text(input.program.source.ast, expression.Head) },
  ];
  for (const spanNode of expression.TemplateSpans?.Nodes ?? []) {
    if (spanNode === undefined) {
      continue;
    }
    const span = AsTemplateSpan(input.program.source.ast, spanNode)!;
    const expression = planExpression(span.Expression!, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    parts.push({
      kind: "Interpolation",
      expression,
    });
    parts.push({ kind: "InterpolatedStringText", text: Node_Text(input.program.source.ast, span.Literal) });
  }
  return { kind: "InterpolatedStringExpression", parts };
}
