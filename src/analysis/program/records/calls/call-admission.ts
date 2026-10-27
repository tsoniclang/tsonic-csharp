import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallAdmissionRecords, CsharpAdmittedCallClassification } from "../../../../target-model/records/calls/call-admission.js";

export function createCsharpCallAdmissionRecords(entries: ReadonlyMap<Node, CsharpAdmittedCallClassification>): CsharpCallAdmissionRecords {
  const values = new WeakMap<Node, CsharpAdmittedCallClassification>();
  for (const [node, value] of entries) {
    if (values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native call has one exact source admission owner.", node);
    values.set(node, Object.freeze(value));
  }
  return Object.freeze({ selectedCall: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
