import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTemplateStringEmission, CsharpTemplateStringRecords } from "../../../../target-model/records/operations/template-strings.js";

export function createCsharpTemplateStringProducer() {
  let closed = false;
  const values = new Map<Node, CsharpTemplateStringEmission>();
  return Object.freeze({ publish(node: Node, value: CsharpTemplateStringEmission): void {
    if (closed || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A template has one exact pre-seal substitution producer.", node);
    values.set(node, Object.freeze(value));
  }, seal(): CsharpTemplateStringRecords {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native template records seal exactly once.");
    closed = true;
    return Object.freeze({ templateString: Object.freeze({ get: (node: Node) => values.get(node) }) });
  } });
}
