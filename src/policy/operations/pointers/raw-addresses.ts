import type { CsharpSourceRawAddressOperation } from "../../../target-model/records/raw-addresses.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";

export function csharpRawAddressResultType(fact: CsharpSourceRawAddressOperation): TargetTypeRef {
  return fact.operation === "raw-to-address-integer"
    ? csharpSourcePrimitiveTargetType(fact.addressWidth === 32 ? "uint32" : "uint64")
    : csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
}
