import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeParameterEmission, CsharpTypeParameterEmissionRecords } from "../../../../target-model/records/types/type-parameters.js";

export function createCsharpTypeParameterEmissionProducer() {
  let open = true;
  const values = new WeakMap<Node, CsharpTypeParameterEmission>();
  return Object.freeze({
    publish(node: Node, value: CsharpTypeParameterEmission): void {
      if (!open || values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native type parameter is selected exactly once before its seal.", node);
      values.set(node, Object.freeze(value));
    },
    seal(): CsharpTypeParameterEmissionRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native type parameters seal exactly once.");
      open = false;
      return Object.freeze({ typeParameterEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
    },
  });
}
