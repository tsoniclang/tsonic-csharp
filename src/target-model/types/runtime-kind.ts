import type { CsharpTargetNamedTypeRef, CsharpTypeofRuntimeKind, TargetTypeRef } from "./model.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "./runtime-carriers.js";
import { getCsharpDelegateSignature } from "./delegates.js";
import { targetTypeRefEquals } from "./equality.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";

export type CsharpTypeofResult = CsharpTypeofRuntimeKind
  | { readonly kind: "optional"; readonly sourceCarrier: TargetTypeRef; readonly element: TargetTypeRef; readonly value: CsharpTypeofResult }
  | { readonly kind: "runtime-union"; readonly sourceCarrier: TargetTypeRef;
      readonly arms: readonly { readonly carrier: TargetTypeRef; readonly result: CsharpTypeofResult }[] };

export function getCsharpTypeofResult(
  type: TargetTypeRef | undefined,
  active: ReadonlySet<TargetTypeRef> = new Set(),
  definitions?: CsharpTypeDefinitions,
): CsharpTypeofResult | undefined {
  if (type === undefined || active.has(type)) return undefined;
  const literal = getCsharpTypeofRuntimeKind(type);
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

export function getCsharpTypeofRuntimeKind(type: TargetTypeRef | undefined): CsharpTypeofRuntimeKind | undefined {
  if (isCsharpAbsenceTargetType(type)) return "object";
  if (type === undefined || getCsharpNullableElementTargetType(type) !== undefined) return undefined;
  if (type.kind === "function-pointer" || getCsharpDelegateSignature(type) !== undefined) return "function";
  if (type.kind === "array") return "object";
  if (type.kind === "target-named") {
    const named = type as CsharpTargetNamedTypeRef;
    return named.csharpTypeofRuntimeKind ?? (named.csharpSourceDeclarationKind === "class" ? "object" : undefined);
  }
  if (type.kind !== "source-primitive") return undefined;
  if (type.name === "bool") return "boolean";
  if (type.name === "char") return "string";
  return type.name === "int64" || type.name === "uint64" || type.name === "int128" || type.name === "uint128"
    ? "bigint" : "number";
}

export function csharpTypeofResultsEqual(left: CsharpTypeofResult, right: CsharpTypeofResult): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  if (left.kind !== right.kind || !targetTypeRefEquals(left.sourceCarrier, right.sourceCarrier)) return false;
  if (left.kind === "optional" && right.kind === "optional") {
    return targetTypeRefEquals(left.element, right.element) && csharpTypeofResultsEqual(left.value, right.value);
  }
  return left.kind === "runtime-union" && right.kind === "runtime-union" &&
    left.arms.length === right.arms.length && left.arms.every((arm, index) =>
      targetTypeRefEquals(arm.carrier, right.arms[index]!.carrier) && csharpTypeofResultsEqual(arm.result, right.arms[index]!.result));
}
