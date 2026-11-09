import type { Node } from "@tsonic/tsts";
import type { SourceNativePointerOperation, SourceRawAddressOperation } from "@tsonic/target-api/source";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../../policy/model/memory.js";
import type { CsharpNativePointerOperationSelection, CsharpResolvedNativePointerOperationBase } from "../../../target-model/records/native/native-pointers.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpRuntimeRawPointerTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { represented, sourceOutcome } from "../../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpRawAddress } from "./raw-addresses.js";
import { selectCsharpRawLocation } from "./native-memory.js";
import { selectCsharpMemoryRuntimeDefinition } from "./runtime-definitions.js";
import { selectCsharpMemoryObservation } from "./layout-observations.js";

export function selectCsharpNativePointerOperation(input: CsharpMemoryAnalysisHost,
  node: Node): CsharpMemoryOutcome<CsharpNativePointerOperationSelection> {
  const selected = sourceOutcome(input.facts.protocols.pointerOperation(node));
  if (selected.kind !== "represented") return selected;
  if (selected.value.kind === "none") {
    const observation = selectCsharpMemoryObservation(input, node);
    if (observation.kind !== "represented") return observation;
    return represented(observation.value ?? Object.freeze({ kind: "not-native-pointer" }));
  }
  const source = selected.value.value;
  if (source.occurrence !== node) throw new TypeError("A Native pointer operation must retain its identical original Source occurrence.");
  if (source.family === "native-pointer") return selectNativePointer(input, source);
  if (source.family === "raw-address") return selectRawIdentity(input, source);
  if (source.family === "raw-memory") {
    if (source.operation !== "to-raw" && source.operation !== "reinterpret") return selectCsharpRawAddress(input, source);
    const selected = selectCsharpRawLocation(input, node);
    if (selected.kind !== "represented") return selected;
    if (selected.value === undefined) throw new TypeError("An authenticated raw operation requires its same scoped Source raw-location proof.");
    return represented(selected.value);
  }
  return represented(Object.freeze({ kind: "not-native-pointer" }));
}

function selectRawIdentity(input: CsharpMemoryAnalysisHost,
  source: SourceRawAddressOperation): CsharpMemoryOutcome<CsharpNativePointerOperationSelection> {
  if (source.operation === "bind-raw-pointer") return represented(Object.freeze({ kind: "not-native-pointer" }));
  const definition = selectCsharpMemoryRuntimeDefinition(input, "RawPointer", source.occurrence);
  if (definition.kind !== "represented") return definition;
  const carrier = csharpRuntimeRawPointerTargetType(definition.value);
  const operands = source.operation === "equal-raw-pointer" ? [source.left, source.right] : [source.pointer];
  for (const operand of operands) {
    const selected = input.nativeValue(operand.occurrence);
    if (selected.kind !== "represented") return selected;
    const value = getCsharpNullableElementTargetType(selected.value) ?? selected.value;
    if (!isCsharpAbsenceTargetType(value) && !targetTypeRefEquals(input.typeIdentity, value, carrier)) return represented(Object.freeze({
      kind: "rejected", operation: source.operation, reason: "Raw pointer identity requires the exact acquired Native address carrier or absence." }));
  }
  return represented(Object.freeze({ kind: "raw-identity", method: source.operation === "equal-raw-pointer" ? "Same" : "Hash",
    arguments: Object.freeze(operands.map(operand => operand.occurrence)), carrier, parameterType: csharpNullableReferenceTargetType(carrier) }));
}

function selectNativePointer(input: CsharpMemoryAnalysisHost,
  source: SourceNativePointerOperation): CsharpMemoryOutcome<CsharpNativePointerOperationSelection> {
  const selected = input.nativeValue(source.pointer.occurrence);
  if (selected.kind !== "represented") return selected;
  const pointee = input.representation.represent(source.pointee, "storage", source.occurrence);
  if (pointee.kind !== "represented") return pointee;
  const pointerType = selected.value;
  if (pointerType.kind !== "pointer" || !targetTypeRefEquals(input.typeIdentity, pointerType.pointee, pointee.value.carrier)) {
    return represented(Object.freeze({ kind: "rejected", operation: source.operation,
      reason: "The original Native pointer operation requires its exact physical pointer and pointee ABI." }));
  }
  const base: CsharpResolvedNativePointerOperationBase = Object.freeze({ call: source.occurrence,
    pointerExpression: source.pointer.occurrence, pointerType, pointeeType: pointerType.pointee });
  if (source.operation === "load") return represented(Object.freeze({ ...base, kind: "load" }));
  if (source.operation === "store") {
    const value = input.nativeValue(source.value.occurrence);
    return value.kind !== "represented" ? value : represented(Object.freeze({ ...base, kind: "store", valueExpression: source.value.occurrence }));
  }
  const offset = input.nativeValue(source.offset.occurrence);
  if (offset.kind !== "represented") return offset;
  return targetTypeRefEquals(input.typeIdentity, offset.value, csharpSourcePrimitiveTargetType("native-int"))
    ? represented(Object.freeze({ ...base, kind: "offset", offsetExpression: source.offset.occurrence, offsetType: offset.value }))
    : represented(Object.freeze({ kind: "rejected", operation: "offset", reason: "The selected Native pointer offset must retain its exact native-int carrier." }));
}
