import type { CsharpTargetNamedTypeRef, CsharpTypeofRuntimeKind, TargetTypeRef } from "./model.js";
import { getCsharpNullableElementTargetType } from "./carriers/nullable.js";
import { isCsharpAbsenceTargetType } from "./carriers/runtime-carriers.js";
import { getCsharpDelegateSignature } from "./carriers/delegates.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";

import { targetTypeRefEquals } from "./equality.js";

// Typeof categories are Host facts (facts.values.typeofCategory, N3'); C# only carries them with the physical carrier.
export type CsharpTypeofResult = CsharpTypeofRuntimeKind
  /** A nullable carrier: `absent` is the Host category of its absent value (undefined-only → "undefined", null-only → "object"). */
  | { readonly kind: "optional"; readonly sourceCarrier: TargetTypeRef; readonly element: TargetTypeRef; readonly value: CsharpTypeofResult;
      readonly absent: "undefined" | "object" }
  | { readonly kind: "runtime-union"; readonly sourceCarrier: TargetTypeRef;
      readonly arms: readonly { readonly carrier: TargetTypeRef; readonly result: CsharpTypeofResult }[] };

export function csharpTypeofResultsEqual(left: CsharpTypeofResult, right: CsharpTypeofResult): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  if (left.kind !== right.kind || !targetTypeRefEquals(left.sourceCarrier, right.sourceCarrier)) return false;
  if (left.kind === "optional" && right.kind === "optional") {
    return targetTypeRefEquals(left.element, right.element) && left.absent === right.absent &&
      csharpTypeofResultsEqual(left.value, right.value);
  }
  return left.kind === "runtime-union" && right.kind === "runtime-union" &&
    left.arms.length === right.arms.length && left.arms.every((arm, index) =>
      targetTypeRefEquals(arm.carrier, right.arms[index]!.carrier) && csharpTypeofResultsEqual(arm.result, right.arms[index]!.result));
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
