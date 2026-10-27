import type { Node } from "@tsonic/tsts";
import type { CsharpNativeConstructionDemandQueries, CsharpNativeConstructionIssue, CsharpNativeConstructionSelection } from "../../../../target-model/records/native/native-construction.js";

export function createCsharpNativeConstructionRecords(
  entries: ReadonlyMap<Node, CsharpNativeConstructionSelection>,
  issues: readonly CsharpNativeConstructionIssue[],
): CsharpNativeConstructionDemandQueries {
  const selected = new WeakMap(entries);
  const complete = issues.length === 0;
  return Object.freeze({ issues: Object.freeze([...issues]),
    constructionFor: (node: Node) => complete ? selected.get(node) : undefined,
  });
}
