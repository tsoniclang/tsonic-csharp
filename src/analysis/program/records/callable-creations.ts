import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableCreationIndex } from "../../../target-model/records/callable-values.js";
import type { CsharpNativeCallableCreation } from "../../../target-model/records/native-demand.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function createCsharpCallableCreationProducer() {
  const creations = new WeakMap<Node, CsharpNativeCallableCreation>();
  const targets = new WeakMap<Node, TargetTypeRef>();
  let closed = false;
  return Object.freeze({
    publish(node: Node, value: CsharpNativeCallableCreation): void {
      if (closed || creations.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native callable creation publishes once before sealing.", node);
      creations.set(node, Object.freeze(value));
      if (value.kind === "selected") targets.set(node, value.carrier);
    },
    seal(): CsharpCallableCreationIndex {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native callable creations seal once.");
      closed = true;
      return Object.freeze({
        callableCreation: Object.freeze({ get: (node: Node) => creations.get(node) }),
        callableTarget: Object.freeze({ get: (node: Node) => targets.get(node) }),
      });
    },
  });
}
