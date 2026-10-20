import { sourceIntegerIsNonnegative, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { CsharpIntegerRangeIndex } from "../../../target-model/records/integer-ranges.js";

export function createCsharpIntegerRangeIndex(source: TargetSourceProgram, nodes: readonly Node[]): CsharpIntegerRangeIndex {
  const nonnegative = new WeakSet<Node>();
  for (const node of nodes) {
    if (sourceIntegerIsNonnegative({ ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts }, node)) {
      nonnegative.add(node);
    }
  }
  return Object.freeze({ get: (expression: Node) => nonnegative.has(expression) });
}
