import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../../surfaces/js/source-library.js";

export const nodeBufferStringTargetType = csharpStringTargetType();
export const nodeBufferIntTargetType = csharpSourcePrimitiveTargetType("int32");
export const nodeBufferByteTargetType = csharpSourcePrimitiveTargetType("uint8");
export const nodeBufferSbyteTargetType = csharpSourcePrimitiveTargetType("int8");
export const nodeBufferShortTargetType = csharpSourcePrimitiveTargetType("int16");
export const nodeBufferUshortTargetType = csharpSourcePrimitiveTargetType("uint16");
export const nodeBufferUintTargetType = csharpSourcePrimitiveTargetType("uint32");
export const nodeBufferFloatTargetType = csharpSourcePrimitiveTargetType("float32");
export const nodeBufferDoubleTargetType = csharpSourcePrimitiveTargetType("float64");
export const nodeBufferBoolTargetType = csharpSourcePrimitiveTargetType("bool");
export const nodeBufferObjectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });

export function nodeBufferNullableIntTargetType() {
  return csharpNullableValueTargetType(nodeBufferIntTargetType);
}

export function nodeBufferToStringEndTargetType() {
  return csharpTargetNamedType("System.Nullable`1", [nodeBufferIntTargetType], { kind: "nullable" });
}
