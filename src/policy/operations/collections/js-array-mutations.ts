import type { CsharpJsArrayMutationSelection } from "../../../target-model/records/storage/js-array-mutations.js";
import type { Node } from "@tsonic/tsts";

import { getCsharpJsArrayMutationPolicy } from "../../types/index.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
export function selectCsharpNativeArrayLengthWrite(
  receiver: TargetTypeRef | undefined, receiverExpression: Node, value: Node,
): CsharpJsArrayMutationSelection {
  const mutation = getCsharpJsArrayMutationPolicy(receiver);
  if (mutation === undefined) {
    return {
      kind: "rejected",
      reason:
        "The selected mutable JS Array length property has no closed C# mutation carrier.",
    };
  }
  return {
    kind: "set-length",
    receiver: receiverExpression,
    value,
    valueType: csharpSourcePrimitiveTargetType("float64"),
    targetMemberName: mutation.setLengthMemberName,
  };
}
