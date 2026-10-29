import type { Node } from "@tsonic/tsts";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue, CsharpNativeConstructionSelection } from "../../../../target-model/records/native/native-construction.js";

export function createCsharpNativeConstructionRecords(
  entries: ReadonlyMap<Node, CsharpNativeConstructionSelection>,
  issues: readonly CsharpNativeConstructionIssue[],
): CsharpNativeConstructionDemandQueries {
  const selected = new WeakMap(entries);
  return Object.freeze({ issues: Object.freeze([...issues]),
    constructionFor: (node: Node) => selected.get(node),
  });
}
