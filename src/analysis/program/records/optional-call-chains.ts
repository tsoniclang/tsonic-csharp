import type { Node } from "@tsonic/tsts";
import type { CsharpOptionalCallChain, CsharpOptionalCallChainRecords } from "../../../target-model/records/optional-call-chains.js";

export function createCsharpOptionalCallChainRecords(entries: ReadonlyMap<Node, CsharpOptionalCallChain>): CsharpOptionalCallChainRecords {
  const values = new WeakMap<Node, CsharpOptionalCallChain>();
  for (const [node, value] of entries) values.set(node, Object.freeze(value));
  return Object.freeze({ optionalCallChain: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
