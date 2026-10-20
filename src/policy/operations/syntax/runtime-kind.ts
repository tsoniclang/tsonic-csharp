import type { CsharpTargetNamedTypeRef, CsharpTypeofRuntimeKind, TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";

import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

import type { CsharpTypeofResult } from "../../../target-model/types/runtime-kind.js";
export function getCsharpTypeofResult(
  type: TargetTypeRef | undefined,
  active: ReadonlySet<TargetTypeRef> = new Set(),
  definitions?: CsharpTypeDefinitions,
): CsharpTypeofResult | undefined {
  if (type === undefined || active.has(type)) return undefined;
  const literal = getCsharpTypeofRuntimeKind(type, definitions);
  if (literal !== undefined) return literal;
  const nested = new Set(active).add(type);
  const optional = getCsharpNullableElementTargetType(type);
  if (optional !== undefined) {
    const value = getCsharpTypeofResult(optional, nested, definitions);
    return value === undefined ? undefined : { kind: "optional", sourceCarrier: type, element: optional, value };
  }
  const arms = getCsharpRuntimeUnionArms(type, definitions)?.map(carrier => {
    const result = getCsharpTypeofResult(carrier, nested, definitions);
    return result === undefined ? undefined : { carrier, result };
  });
  return arms === undefined || arms.some(arm => arm === undefined) ? undefined
    : { kind: "runtime-union", sourceCarrier: type, arms: arms.map(arm => arm!) };
}

export function getCsharpTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): CsharpTypeofRuntimeKind | undefined {
  if (isCsharpAbsenceTargetType(type)) return "object";
  if (type === undefined || getCsharpNullableElementTargetType(type) !== undefined) return undefined;
  if (type.kind === "function-pointer" || getCsharpDelegateSignature(type) !== undefined) return "function";
  if (type.kind === "array") return "object";
  if (type.kind === "target-named") {
    const named = type as CsharpTargetNamedTypeRef;
    return named.csharpTypeofRuntimeKind ??
      (named.csharpSourceDeclarationKind === "class" || definitions?.nativeDeclarationKind(type) === "class" ? "object" : undefined);
  }
  if (type.kind !== "source-primitive") return undefined;
  if (type.name === "bool") return "boolean";
  if (type.name === "char") return "string";
  return type.name === "int64" || type.name === "uint64" || type.name === "int128" || type.name === "uint128"
    ? "bigint" : "number";
}
