import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableCreationIndex } from "../../../../target-model/records/callables/callable-values.js";
import type { CsharpNativeCallableCreation } from "../../../../target-model/records/native/native-demand.js";

export function createCsharpCallableCreationProducer(nodes: readonly Node[]) {
  const domain = new WeakSet(nodes);
  const creations = new WeakMap<Node, CsharpNativeCallableCreation>();
  let closed = false;
  const read = (node: Node): CsharpNativeCallableCreation | undefined => {
    if (!domain.has(node)) failTargetAnalysisInvariant("tsonic-csharp",
      "Callable creation reads require their admitted source-node domain.", node);
    return creations.get(node);
  };
  return Object.freeze({
    publish(node: Node, value: CsharpNativeCallableCreation): void {
      if (closed || creations.has(node) || !domain.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native callable creation publishes once before sealing.", node);
      creations.set(node, Object.freeze(value));
    },
    seal(): CsharpCallableCreationIndex {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native callable creations seal once.");
      closed = true;
      return Object.freeze({
        callableCreation: Object.freeze({ get: read }),
        callableTarget: Object.freeze({ get: (node: Node) => {
          const creation = read(node);
          return creation?.kind === "selected" ? creation.carrier : undefined;
        } }),
      });
    },
  });
}
