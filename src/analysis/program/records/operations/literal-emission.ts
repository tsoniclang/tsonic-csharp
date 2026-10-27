import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpLiteralEmission, CsharpLiteralEmissionRecords } from "../../../../target-model/records/operations/literal-emission.js";

export function createCsharpLiteralEmissionProducer() {
  const values = new Map<Node, CsharpLiteralEmission>();
  let closed = false;
  return Object.freeze({ publish(node: Node, value: CsharpLiteralEmission): void {
    if (closed || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A raw native literal has one exact pre-seal producer.", node);
    values.set(node, Object.freeze(value));
  }, seal(): CsharpLiteralEmissionRecords {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native literal emission seals exactly once.");
    closed = true;
    return Object.freeze({ literalEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
  } });
}
