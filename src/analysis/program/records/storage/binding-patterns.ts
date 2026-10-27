import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpBindingPatternClassifications, CsharpBindingProjectionFact } from "../../../../target-model/records/objects/value-projections.js";

export function createCsharpBindingPatternProducer() {
  const selections = new WeakMap<Node, CsharpBindingProjectionFact>();
  let closed = false;
  return Object.freeze({
    admit(node: Node, fact: CsharpBindingProjectionFact): void {
      if (closed || selections.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "An admitted binding projection publishes exactly once before sealing.", node);
      selections.set(node, Object.freeze(fact));
    },
    seal(): CsharpBindingPatternClassifications {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Binding projection records seal exactly once.");
      closed = true;
      return Object.freeze({ bindingPatternProjection: Object.freeze({ get: (node: Node) => selections.get(node) }) });
    },
  });
}
