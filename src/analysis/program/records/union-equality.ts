import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpUnionEqualityEmission, CsharpUnionEqualityRecords } from "../../../target-model/records/union-equality.js";

export function createCsharpUnionEqualityProducer() {
  let open = true;
  const values = new Map<Node, CsharpUnionEqualityEmission>();
  return Object.freeze({
    publish(node: Node, value: CsharpUnionEqualityEmission): void {
      if (!open || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "An admitted union equality has one producer before sealing.", node);
      values.set(node, Object.freeze(value));
    },
    seal(): CsharpUnionEqualityRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Union equality plans seal exactly once.");
      open = false;
      return Object.freeze({ unionEquality: Object.freeze({ get: (node: Node) => values.get(node) }) });
    },
  });
}
