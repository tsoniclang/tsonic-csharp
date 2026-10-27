import type { Node } from "@tsonic/tsts";
import type { CsharpAdmittedConstruction, CsharpConstructionRecords } from "../../../../target-model/records/objects/construction.js";

export function createCsharpConstructionRecords(entries: ReadonlyMap<Node, CsharpAdmittedConstruction>): CsharpConstructionRecords {
  const values = new WeakMap<Node, CsharpAdmittedConstruction>();
  for (const [node, value] of entries) values.set(node, Object.freeze(value));
  return Object.freeze({ constructionEmission: Object.freeze({ get: (node: Node) => values.get(node) }) });
}
