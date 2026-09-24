import type { CsharpTargetNamedTypeRef, CsharpTypeofRuntimeKind, TargetTypeRef } from "./model.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import { isCsharpAbsenceTargetType } from "./runtime-carriers.js";

export function getCsharpTypeofRuntimeKind(type: TargetTypeRef | undefined): CsharpTypeofRuntimeKind | undefined {
  if (isCsharpAbsenceTargetType(type)) return "object";
  if (type === undefined || getCsharpNullableElementTargetType(type) !== undefined) return undefined;
  if (type.kind === "target-named") return (type as CsharpTargetNamedTypeRef).csharpTypeofRuntimeKind;
  if (type.kind !== "source-primitive") return undefined;
  if (type.name === "bool") return "boolean";
  if (type.name === "char") return "string";
  return type.name === "int64" || type.name === "uint64" || type.name === "int128" || type.name === "uint128"
    ? "bigint" : "number";
}
