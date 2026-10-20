import type { TypeIndexInfo } from "@tsonic/tsts";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpGenericOptionalParts, getCsharpNullableElementTargetType, isCsharpJsValueTargetType, targetTypeRefKey } from "../../../target-model/types/index.js";

export function indexedRecordMember(receiver: TargetTypeRef, key: TargetTypeRef, value: TargetTypeRef, index: TypeIndexInfo) {
  return { member: { id: `tsonic.csharp.record.index:${targetTypeRefKey(receiver)}`, sourceName: "Item", targetName: "Item",
    kind: "indexer" as const, declaringType: receiver, returnType: value, readonly: index.readonly,
    parameters: [{ name: "key", type: key, passingMode: "by-value" as const }] },
    optionalRead: getCsharpNullableElementTargetType(value) !== undefined ||
      getCsharpGenericOptionalParts(value) !== undefined || isCsharpJsValueTargetType(value) };
}
