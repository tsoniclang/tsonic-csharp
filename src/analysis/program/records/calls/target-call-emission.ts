import type { Node } from "@tsonic/tsts";
import type { CsharpTargetCallEmission, CsharpTargetCallEmissionRecords } from "../../../../target-model/records/calls/target-call-emission.js";

export function createCsharpTargetCallEmissionRecords(entries: ReadonlyMap<Node, CsharpTargetCallEmission>): CsharpTargetCallEmissionRecords {
  const values = new WeakMap<Node, CsharpTargetCallEmission>();
  for (const [node, value] of entries) values.set(node, Object.freeze(value));
  return Object.freeze({ targetCallEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
