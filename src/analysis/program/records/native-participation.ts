import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeParticipation, CsharpNativeParticipationInput } from "../../../target-model/records/native-demand.js";

export function createCsharpNativeParticipationProducer() {
  const participation = new WeakMap<Node, CsharpNativeParticipation>();
  let sealed = false;
  return Object.freeze({
    selected(node: Node, value: CsharpNativeParticipation): void {
      if (sealed || participation.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "Native participation publishes once before sealing.", node);
      participation.set(node, value);
    },
    seal(): CsharpNativeParticipationInput {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Native participation seals once.");
      sealed = true;
      return Object.freeze({ participation: Object.freeze({ get: (node: Node) => participation.get(node) }) });
    },
  });
}
