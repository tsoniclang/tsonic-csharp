import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpJsCallEmission, CsharpJsCallRecords } from "../../../target-model/records/js-value-calls.js";

export function createCsharpJsCallRecords(entries: ReadonlyMap<Node, CsharpJsCallEmission>): CsharpJsCallRecords {
  const values = new WeakMap<Node, CsharpJsCallEmission>();
  for (const [node, value] of entries) {
    if (values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A JS call has one exact native invocation owner.", node);
    values.set(node, Object.freeze(value));
  }
  return Object.freeze({ jsCall: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
