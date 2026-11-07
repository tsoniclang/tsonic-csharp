import type { CsharpRawAddressSelection } from "../../../target-model/records/storage/raw-addresses.js";
import type { Node } from "@tsonic/tsts";

import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

import { readCsharpSourceRawAddress } from "../../../source/extension/raw-addresses.js";
import { csharpRawAddressResultType } from "../../../policy/operations/pointers/raw-addresses.js";

/**
 * Raw address arithmetic over the source-core Host record (K-2662): the record proves the operand bindings and the
 * finalized registered ABI; C# selects the runtime method and the .NET parameter carriers.
 */
export function selectCsharpRawAddress(
  input: CsharpPolicyContext,
  node: Node,
): CsharpRawAddressSelection | undefined {
  const record = readCsharpSourceRawAddress(input.facts, node);
  if (record === undefined) return undefined;
  if (record.kind === "rejected") return { kind: "rejected", operation: record.operation, reason: record.reason };
  const operands = record.operation === "byte-offset" ? [record.raw, record.offset]
    : record.operation === "raw-to-address-integer" ? [record.raw] : [record.address];
  const raw = csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
  const parameters = operands.map((operand, index) => {
    const parameterType = record.operation === "address-integer-to-raw"
      ? csharpSourcePrimitiveTargetType("uint64")
      : index === 0 ? raw : csharpSourcePrimitiveTargetType(
        record.operation === "byte-offset" && record.offsetSignedness === "unsigned" ? "uint128" : "int128");
    const sourceType = input.types.value(operand.expression);
    return sourceType.kind === "csharp-refused" ? undefined : Object.freeze({ expression: operand.expression, sourceType, parameterType,
      cast: !targetTypeRefEquals(sourceType, parameterType) });
  });
  if (parameters.some(parameter => parameter === undefined)) {
    return { kind: "rejected", operation: record.operation, reason: "A raw address operand has no closed C# value carrier." };
  }
  return Object.freeze({ kind: "raw-address", width: record.dataLayout.addressWidth,
    method: record.operation === "raw-to-address-integer" ? "Address"
      : record.operation === "address-integer-to-raw" ? "FromAddress"
        : record.offsetSignedness === "unsigned" ? "OffsetUnsigned" : "Offset",
    resultType: csharpRawAddressResultType(record), arguments: Object.freeze(parameters.filter(parameter => parameter !== undefined)) });
}
