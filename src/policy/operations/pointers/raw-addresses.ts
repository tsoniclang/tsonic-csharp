import type { CsharpRawAddressOperationKind } from "../../../target-model/records/storage/raw-addresses.js";

import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";

export function csharpRawAddressResultType(operation: CsharpRawAddressOperationKind,
  width: 32 | 64, raw: TargetTypeRef): TargetTypeRef {
  return operation === "raw-to-address-integer"
    ? csharpSourcePrimitiveTargetType(width === 32 ? "uint32" : "uint64")
    : csharpNullableReferenceTargetType(raw);
}
