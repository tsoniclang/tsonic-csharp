import type { CsharpElementDeletionSelection } from "../../../target-model/records/storage/element-deletion.js";
import type { Node } from "@tsonic/tsts";

import { csharpSourcePrimitiveTargetType, isCsharpRecordDictionaryTargetType } from "../../../target-model/types/index.js";

import { getCsharpJsArrayMutationPolicy } from "../../types/index.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
export function selectCsharpNativeElementDeletion(
  receiver: TargetTypeRef | undefined, receiverExpression: Node, indexExpression: Node, jsArrayIndexer: boolean,
): CsharpElementDeletionSelection {
  if (isCsharpRecordDictionaryTargetType(receiver) && receiver.typeArguments?.length === 2) {
    return { kind: "resolved", receiver: receiverExpression, index: indexExpression,
      keyType: receiver.typeArguments[0]!, targetMemberName: "Remove" };
  }
  const mutation = getCsharpJsArrayMutationPolicy(receiver);
  if (jsArrayIndexer && mutation !== undefined) {
    return { kind: "resolved", receiver: receiverExpression, index: indexExpression,
      keyType: csharpSourcePrimitiveTargetType("float64"), targetMemberName: mutation.deleteAtMemberName };
  }
  return { kind: "rejected", reason: "Deletion requires an exact native indexed-record or JS Array deletion contract." };
}
