import type { CsharpElementDeletionSelection } from "../../../target-model/records/element-deletion.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

import { selectCsharpNativeElementDeletion } from "../../../policy/operations/collections/element-deletion.js";
export function selectCsharpElementDeletion(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpElementDeletionSelection {
  const operand = input.ast.as.AsDeleteExpression(node)?.Expression;
  const semantics = input.semantics(sourceFile);
  const source = operand === undefined || !input.ast.is.IsElementAccessExpression(operand)
    ? undefined : semantics.operations.elementAccess(operand);
  if (source === undefined) return { kind: "rejected", reason: "Deletion requires one exact checked element access." };
  const receiver = input.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile);
  const indexed = semantics.types.selectIndexedAccess(source.receiver.type, source.argument.type);
  const member = indexed?.kind === "resolved" && indexed.members.length === 1 ? indexed.members[0] : undefined;
  if (member?.kind !== "index" || member.index.readonly) {
    return { kind: "rejected", reason: "Deletion requires one exact mutable checked index signature." };
  }
  const identity = csharpSourceProfileDeclarationIdentity(input.ast, semantics, input.sourceFacts, source.selectedDeclaration);
  return selectCsharpNativeElementDeletion(receiver, source.receiver.expression, source.argument.expression,
    identity?.owner === "js" && identity.kind === "indexer" && identity.declaringName === "Array");
}
