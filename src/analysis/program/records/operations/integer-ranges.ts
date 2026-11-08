import type { Node } from "@tsonic/tsts";
import type { CsharpIntegerRangeIndex } from "../../../../target-model/records/operations/integer-ranges.js";

export function createCsharpIntegerRangeIndex() {
  const nonnegative = new WeakSet<Node>();
  const records: CsharpIntegerRangeIndex = Object.freeze({ get: (expression: Node) => nonnegative.has(expression) });
  return Object.freeze({ records, retain(expression: Node, provenNonnegative: boolean): void {
    if (provenNonnegative) nonnegative.add(expression);
  } });
}
