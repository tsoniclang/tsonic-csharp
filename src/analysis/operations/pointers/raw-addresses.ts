import type { SourceRawMemoryOperation } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpMemoryOutcome } from "../../../policy/model/memory.js";
import type { CsharpRawAddressSelection } from "../../../target-model/records/storage/raw-addresses.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeRawPointerTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { represented } from "../../../policy/types/source-type-flow/representation-results.js";
import { csharpRawAddressResultType } from "../../../policy/operations/pointers/raw-addresses.js";
import { selectCsharpMemoryRuntimeDefinition } from "./runtime-definitions.js";

type Operation = Extract<SourceRawMemoryOperation,
  { readonly operation: "byte-offset" | "raw-to-address-integer" | "address-integer-to-raw" }>;

export function selectCsharpRawAddress(input: CsharpPolicyContext, operation: Operation): CsharpMemoryOutcome<CsharpRawAddressSelection> {
  const node = operation.occurrence;
  const bindings = input.sourceStorage.bindingsForLexicalOwner(node);
  if (bindings.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: bindings });
  if (bindings.kind === "unresolved") return bindings;
  const metadata = input.sourceStorage.memory.memoryMetadata.value(operation.dataLayout, bindings.bindings);
  if (metadata.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: metadata });
  if (metadata.kind === "unresolved") return metadata;
  const reject = (reason: string): CsharpMemoryOutcome<CsharpRawAddressSelection> =>
    represented(Object.freeze({ kind: "rejected", operation: operation.operation, reason }));
  if (metadata.value.kind === "none" || metadata.value.value.kind !== "data-layout") {
    return reject("Raw address arithmetic requires its exact finalized scoped address ABI.");
  }
  const abi = metadata.value.value.dataLayout;
  if (operation.operation !== "byte-offset" && operation.integer.width !== abi.addressWidth) {
    return reject("The published address-integer width must equal the finalized native address ABI.");
  }
  const definition = selectCsharpMemoryRuntimeDefinition(input, "RawPointer", node);
  if (definition.kind !== "represented") return definition;
  const owner = csharpRuntimeRawPointerTargetType(definition.value);
  const raw = csharpNullableReferenceTargetType(owner);
  const operands = operation.operation === "byte-offset" ? [operation.raw, operation.offset]
    : operation.operation === "raw-to-address-integer" ? [operation.raw] : [operation.address];
  const arguments_: Extract<CsharpRawAddressSelection, { readonly kind: "raw-address" }>["arguments"][number][] = [];
  for (const [index, operand] of operands.entries()) {
    const selected = input.nativeValue(operand.occurrence);
    if (selected.kind !== "represented") return selected;
    const present = getCsharpNullableElementTargetType(selected.value) ?? selected.value;
    if (operation.operation !== "address-integer-to-raw" && index === 0 &&
      !isCsharpAbsenceTargetType(present) && !targetTypeRefEquals(input.typeIdentity, present, owner)) {
      return reject("The raw address operand must have its actual acquired Native address carrier.");
    }
    const parameterType = operation.operation === "address-integer-to-raw" ? csharpSourcePrimitiveTargetType("uint64")
      : index === 0 ? raw : csharpSourcePrimitiveTargetType(operation.integer.signedness === "unsigned" ? "uint128" : "int128");
    arguments_.push(Object.freeze({ expression: operand.occurrence, sourceType: selected.value, parameterType,
      cast: !targetTypeRefEquals(input.typeIdentity, selected.value, parameterType) }));
  }
  return represented(Object.freeze({ kind: "raw-address", owner, width: abi.addressWidth,
    method: operation.operation === "raw-to-address-integer" ? "Address" : operation.operation === "address-integer-to-raw"
      ? "FromAddress" : operation.integer.signedness === "unsigned" ? "OffsetUnsigned" : "Offset",
    resultType: csharpRawAddressResultType(operation.operation, abi.addressWidth, owner), arguments: Object.freeze(arguments_) }));
}
