import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import { createCsharpTemplateStringProducer } from "../program/records/template-strings.js";

export function analyzeCsharpTemplateStrings(ast: AstReader, demand: CsharpNativeDemandAnalysis) {
  const producer = createCsharpTemplateStringProducer();
  const visited = new Set<Node>();
  for (const { use } of demand.entries) {
    const node = use.expression;
    if (use.kind === "erased" || visited.has(node) || !ast.is.IsTemplateExpression(node)) continue;
    visited.add(node);
    const expression = ast.as.AsTemplateExpression(node);
    if (expression?.Head === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked template requires its source head.", node);
    const parts = (expression.TemplateSpans?.Nodes ?? []).map(spanNode => {
      const span = spanNode === undefined ? undefined : ast.as.AsTemplateSpan(spanNode);
      if (span?.Expression === undefined || span.Literal === undefined)
        failTargetAnalysisInvariant("tsonic-csharp", "A checked template requires its exact source substitutions.", spanNode ?? node);
      return Object.freeze({ expression: span.Expression, literal: ast.text(span.Literal) });
    });
    producer.publish(node, { head: ast.text(expression.Head), parts: Object.freeze(parts) });
  }
  return producer.seal();
}
