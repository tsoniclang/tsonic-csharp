import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSourceMemberName, CsharpSourceMemberNameRecords } from "../../../../target-model/records/program/source-member-names.js";

export function createCsharpSourceMemberNameRecords(values: ReadonlyMap<Node, CsharpSourceMemberName>): CsharpSourceMemberNameRecords {
  const rows = new WeakMap<Node, CsharpSourceMemberName>();
  for (const [node, value] of values) {
    if (rows.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A source property has one exact native name owner.", node);
    rows.set(node, Object.freeze(value));
  }
  return Object.freeze({ sourceMemberName: Object.freeze({ get: (node: Node) => rows.get(node) }) });
}
