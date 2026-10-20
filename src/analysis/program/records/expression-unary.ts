import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpUnaryEmission, CsharpUnaryEmissionRecords } from "../../../target-model/records/expression-unary.js";

export function createCsharpUnaryEmissionProducer() {
  let open = true;
  const values = new WeakMap<Node, CsharpUnaryEmission>();
  return Object.freeze({
    publish(node: Node, value: CsharpUnaryEmission): void {
      if (!open || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native unary expression has one emission owner before sealing.", node);
      values.set(node, Object.freeze(value));
    },
    seal(): CsharpUnaryEmissionRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Unary emission records seal exactly once.");
      open = false;
      return Object.freeze({ unaryEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
    },
  });
}
