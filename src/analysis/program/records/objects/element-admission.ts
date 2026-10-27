import type { Node } from "@tsonic/tsts";
import type { CsharpAdmittedElementClassification, CsharpElementAdmissionRecords } from "../../../../target-model/records/objects/element-admission.js";

export function createCsharpElementAdmissionRecords(entries: ReadonlyMap<Node, CsharpAdmittedElementClassification>): CsharpElementAdmissionRecords {
  const values = new WeakMap<Node, CsharpAdmittedElementClassification>();
  for (const [node, value] of entries) values.set(node, Object.freeze(value));
  return Object.freeze({ selectedElement: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
