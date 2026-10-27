import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpFlowReadClassifications, CsharpFlowReadProjection } from "../../../../target-model/records/program/source-evidence.js";

export function createCsharpFlowReadProjectionProducer() {
  const projections = new WeakMap<Node, Exclude<CsharpFlowReadProjection, { readonly kind: "rejected" }>>();
  let closed = false;
  return Object.freeze({
    publish(node: Node, value: Exclude<CsharpFlowReadProjection, { readonly kind: "rejected" }>): void {
      if (closed || projections.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native flow-read projection publishes once before sealing.", node);
      projections.set(node, Object.freeze(value));
    },
    seal(issues: CsharpFlowReadClassifications["issues"]): CsharpFlowReadClassifications {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native flow-read projections seal once.");
      closed = true;
      return Object.freeze({ flowReadProjection: Object.freeze({ get: (node: Node) => projections.get(node) }),
        issues: Object.freeze([...issues]) });
    },
  });
}
