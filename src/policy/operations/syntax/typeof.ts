import type { CsharpTypeofComparisonSelection } from "../../../target-model/records/operations/typeof.js";
import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "../../types/index.js";
import type { CsharpTypeofResult } from "../../../target-model/types/runtime-kind.js";

/**
 * A `typeof x === "kind"` comparison over the Host typeof categories (selectCsharpTypeofResult, N3'): constant when
 * every published category gives one answer, else a runtime category test over the physical carrier. C# never
 * classifies a category from the carrier.
 */
export function selectCsharpTypeofComparison(
  operandType: TargetTypeRef,
  category: CsharpTypeofResult,
  runtimeKind: CsharpTypeofRuntimeKind,
  negated: boolean,
): CsharpTypeofComparisonSelection {
  const results = comparisonResults(category, runtimeKind, negated);
  return results.size === 1
    ? { kind: "constant", value: results.values().next().value! }
    : { kind: "runtime-category-test", sourceCarrier: operandType, category, runtimeKind, negated };
}

function comparisonResults(
  category: CsharpTypeofResult,
  runtimeKind: CsharpTypeofRuntimeKind,
  negated: boolean,
): ReadonlySet<boolean> {
  if (typeof category === "string") return new Set([(category === runtimeKind) !== negated]);
  if (category.kind === "optional") return new Set([
    (category.absent === runtimeKind) !== negated,
    ...comparisonResults(category.value, runtimeKind, negated),
  ]);
  return new Set(category.arms.flatMap(arm => [...comparisonResults(arm.result, runtimeKind, negated)]));
}
