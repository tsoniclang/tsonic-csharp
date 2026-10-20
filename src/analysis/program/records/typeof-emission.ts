import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypePredicateEmission, CsharpTypeofEmission, CsharpTypeofEmissionRecords } from "../../../target-model/records/typeof-emission.js";

export function createCsharpTypeofEmissionProducer() {
  let open = true;
  const predicates = new Map<Node, CsharpTypePredicateEmission>();
  const categories = new Map<Node, CsharpTypeofEmission>();
  return Object.freeze({
    predicate(node: Node, value: CsharpTypePredicateEmission): void {
      if (!open || predicates.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native type predicate has one producer before sealing.", node);
      predicates.set(node, Object.freeze(value));
    },
    category(node: Node, value: CsharpTypeofEmission): void {
      if (!open || categories.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native typeof expression has one producer before sealing.", node);
      categories.set(node, Object.freeze(value));
    },
    seal(): CsharpTypeofEmissionRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native type-test entry plans seal exactly once.");
      open = false;
      return Object.freeze({ typePredicateEmission: Object.freeze({ get: (node: Node) => predicates.get(node) }),
        typeofEmission: Object.freeze({ get: (node: Node) => categories.get(node) }) });
    },
  });
}
