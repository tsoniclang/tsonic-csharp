import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import { csharpSourcePrimitiveTargetType, isCsharpRecordDictionaryTargetType } from "../../../target-model/types/index.js";
import { csharpSourceProfileDeclarationIdentity } from "../members/index.js";
import { getCsharpJsArrayMutationPolicy } from "../../types/index.js";

export type CsharpElementDeletionSelection =
  | { readonly kind: "resolved"; readonly receiver: Node; readonly index: Node;
      readonly keyType: TargetTypeRef; readonly targetMemberName: string }
  | { readonly kind: "rejected"; readonly reason: string };

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
  if (isCsharpRecordDictionaryTargetType(receiver) && receiver.typeArguments?.length === 2) {
    return { kind: "resolved", receiver: source.receiver.expression, index: source.argument.expression,
      keyType: receiver.typeArguments[0]!, targetMemberName: "Remove" };
  }
  const identity = csharpSourceProfileDeclarationIdentity(input.ast, semantics, input.sourceFacts, source.selectedDeclaration);
  const mutation = getCsharpJsArrayMutationPolicy(receiver);
  if (identity?.owner === "js" && identity.kind === "indexer" && identity.declaringName === "Array" && mutation !== undefined) {
    return { kind: "resolved", receiver: source.receiver.expression, index: source.argument.expression,
      keyType: csharpSourcePrimitiveTargetType("float64"), targetMemberName: mutation.deleteAtMemberName };
  }
  return { kind: "rejected", reason: "Deletion requires an exact native indexed-record or JS Array deletion contract." };
}
