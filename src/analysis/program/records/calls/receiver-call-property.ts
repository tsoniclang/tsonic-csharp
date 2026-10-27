import type { Node } from "@tsonic/tsts";
import type { CsharpReceiverCallPropertyEmission, CsharpReceiverCallPropertyRecords } from "../../../../target-model/records/calls/receiver-call-property.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpReceiverCallPropertyRecords(entries: ReadonlyMap<Node, CsharpReceiverCallPropertyEmission>): CsharpReceiverCallPropertyRecords {
  const values = new WeakMap<Node, CsharpReceiverCallPropertyEmission>();
  for (const [node, value] of entries) {
    if (values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native computed property has one exact relation admission owner.", node);
    values.set(node, Object.freeze(value));
  }
  return Object.freeze({ receiverCallProperty: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
