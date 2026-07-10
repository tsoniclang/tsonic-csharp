import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpInterpolatedStringPart,
} from "../roslyn/syntax.js";
import {
  AsTemplateExpression,
  AsTemplateSpan,
  Node_Text,
} from "./source-ast.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  requireCsharpStringRuntimeCarrier,
} from "./expression-literal-carriers.js";

export function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "Template string emission")) {
    return undefined;
  }
  const expression = AsTemplateExpression(node)!;
  const parts: CsharpInterpolatedStringPart[] = [
    { kind: "InterpolatedStringText", text: Node_Text(input.ast, expression.Head) },
  ];
  for (const spanNode of expression.TemplateSpans?.Nodes ?? []) {
    if (spanNode === undefined) {
      continue;
    }
    const span = AsTemplateSpan(spanNode)!;
    const expression = planExpression(span.Expression!, sourceFile, input, diagnostics);
    if (expression === undefined) {
      return undefined;
    }
    parts.push({
      kind: "Interpolation",
      expression,
    });
    parts.push({ kind: "InterpolatedStringText", text: Node_Text(input.ast, span.Literal) });
  }
  return { kind: "InterpolatedStringExpression", parts };
}
