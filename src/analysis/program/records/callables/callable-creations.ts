import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableCreationIndex } from "../../../../target-model/records/callables/callable-values.js";
import type { CsharpNativeCallableCreation } from "../../../../target-model/records/native/native-demand.js";

export function createCsharpCallableCreationProducer() {
  const creations = new WeakMap<Node, CsharpNativeCallableCreation>();
  let closed = false;
  return Object.freeze({
    publish(node: Node, value: CsharpNativeCallableCreation): void {
      if (closed || creations.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native callable creation publishes once before sealing.", node);
      creations.set(node, Object.freeze(value));
    },
    seal(): CsharpCallableCreationIndex {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native callable creations seal once.");
      closed = true;
      return Object.freeze({
        callableCreation: Object.freeze({ get: (node: Node) => creations.get(node) }),
        callableTarget: Object.freeze({ get: (node: Node) => {
          const creation = creations.get(node);
          return creation?.kind === "selected" ? creation.carrier : undefined;
        } }),
      });
    },
  });
}
