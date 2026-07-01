import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../../surfaces/js/source-library.js";

export const nodeBufferStringTargetType = csharpStringTargetType();
export const nodeBufferIntTargetType = csharpSourcePrimitiveTargetType("int32");
export const nodeBufferByteTargetType = csharpSourcePrimitiveTargetType("uint8");
export const nodeBufferBoolTargetType = csharpSourcePrimitiveTargetType("bool");
export const nodeBufferObjectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });

export function nodeBufferNullableIntTargetType() {
  return csharpNullableValueTargetType(nodeBufferIntTargetType);
}

export function nodeBufferToStringEndTargetType() {
  return csharpTargetNamedType("System.Nullable`1", [nodeBufferIntTargetType], { kind: "nullable" });
}
