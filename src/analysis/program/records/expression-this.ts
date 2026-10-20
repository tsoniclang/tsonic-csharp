import type { Node } from "@tsonic/tsts";
import type { CsharpThisEmission, CsharpThisEmissionRecords } from "../../../target-model/records/expression-this.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpThisEmissionProducer() {
  let open = true;
  const values = new WeakMap<Node, CsharpThisEmission>();
  return Object.freeze({ publish(node: Node, value: CsharpThisEmission): void {
    if (!open || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A checked this receiver has one native binding owner.", node);
    values.set(node, Object.freeze(value));
  }, seal(): CsharpThisEmissionRecords {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native this binding records seal exactly once.");
    open = false;
    return Object.freeze({ thisEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
  } });
}
