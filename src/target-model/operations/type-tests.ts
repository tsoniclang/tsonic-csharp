import type { TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";

export type CsharpClosedTypeTestPlan =
  | { readonly kind: "constant"; readonly value: boolean }
  | { readonly kind: "native" }
  | { readonly kind: "js-value" }
  | { readonly kind: "optional"; readonly element: TargetTypeRef; readonly test: CsharpClosedTypeTestPlan }
  | { readonly kind: "union"; readonly arms: readonly {
      readonly carrier: TargetTypeRef;
      readonly test: CsharpClosedTypeTestPlan;
    }[] };

export interface CsharpClosedTypeTest {
  readonly sourceCarrier: TargetTypeRef;
  readonly targetCarrier: TargetTypeRef;
  readonly test: CsharpClosedTypeTestPlan;
}

export function csharpClosedTypeTestsEqual(
  left: CsharpClosedTypeTestPlan,
  right: CsharpClosedTypeTestPlan,
  active: ReadonlySet<CsharpClosedTypeTestPlan> = new Set(),
): boolean {
  if (right === undefined || right === null || active.has(right) || left.kind !== right.kind) return false;
  if (left.kind === "constant" && right.kind === "constant") return left.value === right.value;
  if (left.kind === "native" || left.kind === "js-value") return true;
  const nested = new Set(active).add(right);
  if (left.kind === "optional" && right.kind === "optional") {
    return targetTypeRefEquals(left.element, right.element) && csharpClosedTypeTestsEqual(left.test, right.test, nested);
  }
  return left.kind === "union" && right.kind === "union" && Array.isArray(right.arms) &&
    left.arms.length === right.arms.length && left.arms.every((arm, index) => {
      const selected = right.arms[index];
      return selected !== undefined && selected !== null && targetTypeRefEquals(arm.carrier, selected.carrier) &&
        csharpClosedTypeTestsEqual(arm.test, selected.test, nested);
    });
}
