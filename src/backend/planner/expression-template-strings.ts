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
} from "./expression-call-arguments.js";

export function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsTemplateExpression(node)!;
  const parts: CsharpInterpolatedStringPart[] = [
    { kind: "InterpolatedStringText", text: Node_Text(expression.Head) },
  ];
  for (const spanNode of expression.TemplateSpans?.Nodes ?? []) {
    if (spanNode === undefined) {
      continue;
    }
    const span = AsTemplateSpan(spanNode)!;
    parts.push({
      kind: "Interpolation",
      expression: planExpression(span.Expression!, sourceFile, input, diagnostics),
    });
    parts.push({ kind: "InterpolatedStringText", text: Node_Text(span.Literal) });
  }
  return { kind: "InterpolatedStringExpression", parts };
}
