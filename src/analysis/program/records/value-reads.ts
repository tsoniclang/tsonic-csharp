import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpValueRead, CsharpValueReadClassifications, CsharpValueReadStageIndex, CsharpValueReadStages } from "../../../target-model/records/conversions.js";

export function createCsharpValueReadProducer() {
  const stages = new WeakMap<Node, CsharpValueReadStages>();
  const reads = new WeakMap<Node, CsharpValueRead>();
  let stagesClosed = false;
  let readsClosed = false;
  return Object.freeze({
    stage(node: Node, value: CsharpValueReadStages): void {
      if (stagesClosed || stages.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native value-read stage publishes once before sealing.", node);
      stages.set(node, Object.freeze(value));
    },
    sealStages(): CsharpValueReadStageIndex {
      if (stagesClosed) failTargetAnalysisInvariant("tsonic-csharp", "Native value-read stages seal once.");
      stagesClosed = true;
      return Object.freeze({ get: (node: Node) => stages.get(node) });
    },
    read(node: Node, value: CsharpValueRead): void {
      if (!stagesClosed || readsClosed || reads.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native value read publishes once after its stages and before sealing.", node);
      reads.set(node, Object.freeze(value));
    },
    sealReads(): CsharpValueReadClassifications {
      if (!stagesClosed || readsClosed) failTargetAnalysisInvariant("tsonic-csharp", "Native value reads seal once after their stages.");
      readsClosed = true;
      return Object.freeze({ valueRead: Object.freeze({ get: (node: Node) => reads.get(node) }) });
    },
  });
}
