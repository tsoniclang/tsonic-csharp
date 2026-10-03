import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpInterpolatedStringPart } from "../../target-ast/roslyn/index.js";
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
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion } from "./planned-value-composition.js";

export function planTemplateExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "Template string emission")) {
    return undefined;
  }
  const expression = AsTemplateExpression(input.program.source.ast, node)!;
  const operands: CsharpPlannedValue[] = [];
  const parts: (CsharpInterpolatedStringPart | number)[] = [
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
    parts.push(operands.length);
    operands.push(expression);
    parts.push({ kind: "InterpolatedStringText", text: Node_Text(input.program.source.ast, span.Literal) });
  }
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, operands, expressions =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "InterpolatedStringExpression",
      parts: parts.map(part => typeof part === "number" ? { kind: "Interpolation", expression: expressions[part]! } : part) }));
}
