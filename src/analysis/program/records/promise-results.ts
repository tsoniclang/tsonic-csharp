import type { Node } from "@tsonic/tsts";
import type { CsharpPromiseResults, CsharpPromiseResult, CsharpPromiseResultRecords } from "../../../target-model/records/promise-results.js";

export function createCsharpPromiseResultRecords(input: CsharpPromiseResults): CsharpPromiseResultRecords {
  const results = new WeakMap<Node, CsharpPromiseResult>();
  for (const [node, value] of input) results.set(node, Object.freeze(value));
  return Object.freeze({ promiseResult: Object.freeze({ get: (node: Node) => results.get(node) }) });
}
