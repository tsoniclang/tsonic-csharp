import type { CsharpElementDeletionSelection } from "../../../target-model/records/storage/element-deletion.js";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { selectCsharpJsIndexer } from "./js-indexers.js";

import { selectCsharpNativeElementDeletion } from "../../../policy/operations/collections/element-deletion.js";

/** `delete receiver[index]` through the Host-selected mutable index signature (values.elementAccess). */
export function selectCsharpElementDeletion(
  input: CsharpPolicyContext,
  node: Node,
): CsharpElementDeletionSelection {
  const operand = input.ast.as.AsDeleteExpression(node)?.Expression;
  if (operand === undefined || !input.ast.is.IsElementAccessExpression(operand)) {
    return { kind: "rejected", reason: "Deletion requires one exact element access." };
  }
  const source = input.facts.values.elementAccess(operand);
  if (source.selected.kind !== "index-signature" && source.selected.kind !== "element" || source.readonly) {
    return { kind: "rejected", reason: "Deletion requires one exact mutable index signature." };
  }
  const receiver = input.types.represent(source.receiverType, source.receiver, "value");
  return selectCsharpNativeElementDeletion(receiver.kind === "csharp-refused" ? undefined : receiver, source.receiver,
    input.ast.as.AsElementAccessExpression(operand)?.ArgumentExpression ?? failTargetAnalysisInvariant("tsonic-csharp",
      "An element access has no index expression.", operand),
    selectCsharpJsIndexer(input, source) === "Array");
}
