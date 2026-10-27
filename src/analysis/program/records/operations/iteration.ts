import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpAdmittedIteration } from "../../../../target-model/records/operations/selection.js";

export function createCsharpAdmittedIterationProducer() {
  const selections = new WeakMap<Node, CsharpAdmittedIteration>();
  let closed = false;
  return Object.freeze({
    admit(node: Node, selection: CsharpAdmittedIteration): void {
      if (closed || selections.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native iteration is admitted exactly once before sealing.", node);
      selections.set(node, Object.freeze(selection));
    },
    seal() {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native iteration records seal exactly once.");
      closed = true;
      return Object.freeze({ get: (node: Node) => selections.get(node) });
    },
  });
}
