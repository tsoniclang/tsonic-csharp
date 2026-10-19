import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";
import { isCsharpTargetTypeRef } from "../types/snapshot.js";

export type CsharpClosedTypePredicate =
  | { readonly kind: "nominal"; readonly targetCarrier: TargetTypeRef }
  | { readonly kind: "array" };

export type CsharpClosedTypeTestPlan =
  | { readonly kind: "constant"; readonly value: boolean }
  | { readonly kind: "native" }
  | { readonly kind: "js-value" }
  | { readonly kind: "runtime-array" }
  | { readonly kind: "optional"; readonly element: TargetTypeRef; readonly test: CsharpClosedTypeTestPlan }
  | { readonly kind: "union"; readonly arms: readonly {
      readonly carrier: TargetTypeRef;
      readonly test: CsharpClosedTypeTestPlan;
    }[] };

export interface CsharpClosedTypeTest {
  readonly sourceCarrier: TargetTypeRef;
  readonly predicate: CsharpClosedTypePredicate;
  readonly test: CsharpClosedTypeTestPlan;
}

export function csharpClosedTypeTestsEqual(
  left: CsharpClosedTypeTestPlan,
  right: CsharpClosedTypeTestPlan,
  active: ReadonlySet<CsharpClosedTypeTestPlan> = new Set(),
): boolean {
  if (typeof right !== "object" || right === null || active.has(right) || left.kind !== right.kind ||
    Object.keys(left).length !== Object.keys(right).length) return false;
  if (left.kind === "constant" && right.kind === "constant") return left.value === right.value;
  if (left.kind === "native" || left.kind === "js-value" || left.kind === "runtime-array") return true;
  const nested = new Set(active).add(right);
  if (left.kind === "optional" && right.kind === "optional") {
    return isCsharpTargetTypeRef(right.element) && targetTypeRefEquals(left.element, right.element) &&
      csharpClosedTypeTestsEqual(left.test, right.test, nested);
  }
  return left.kind === "union" && right.kind === "union" && Array.isArray(right.arms) &&
    left.arms.length === right.arms.length && left.arms.every((arm, index) => {
      const selected = right.arms[index];
      return selected !== undefined && selected !== null && Object.keys(selected).length === 2 &&
        isCsharpTargetTypeRef(selected.carrier) && targetTypeRefEquals(arm.carrier, selected.carrier) &&
        csharpClosedTypeTestsEqual(arm.test, selected.test, nested);
    });
}
