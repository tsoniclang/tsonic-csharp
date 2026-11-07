import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { CsharpIntegerRangeIndex } from "../../../../target-model/records/operations/integer-ranges.js";

export function createCsharpIntegerRangeIndex(source: TargetSourceProgramFacts, nodes: readonly Node[]): CsharpIntegerRangeIndex {
  const nonnegative = new WeakSet<Node>();
  for (const node of nodes) {
    if (source.facts.analyses.integerIsNonnegative(node)) {
      nonnegative.add(node);
    }
  }
  return Object.freeze({ get: (expression: Node) => nonnegative.has(expression) });
}
