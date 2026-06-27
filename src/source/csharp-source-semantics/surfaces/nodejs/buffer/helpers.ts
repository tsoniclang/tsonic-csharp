import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../js/source-library.js";

export const nodeBufferStringTargetType = csharpStringTargetType();
export const nodeBufferIntTargetType = csharpSourcePrimitiveTargetType("int32");
export const nodeBufferBoolTargetType = csharpSourcePrimitiveTargetType("bool");

export function nodeBufferNullableIntTargetType() {
  return csharpNullableValueTargetType(nodeBufferIntTargetType);
}

export function nodeBufferToStringEndTargetType() {
  return csharpTargetNamedType("System.Nullable`1", [nodeBufferIntTargetType], { kind: "nullable" });
}
