import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "./model.js";

import { targetTypeRefEquals } from "./equality.js";

export type CsharpTypeofResult = CsharpTypeofRuntimeKind
  | { readonly kind: "optional"; readonly sourceCarrier: TargetTypeRef; readonly element: TargetTypeRef; readonly value: CsharpTypeofResult }
  | { readonly kind: "runtime-union"; readonly sourceCarrier: TargetTypeRef;
      readonly arms: readonly { readonly carrier: TargetTypeRef; readonly result: CsharpTypeofResult }[] };

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
