import type { CsharpTypeofComparisonSelection } from "../../../target-model/records/typeof.js";
import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "../../types/index.js";
import { type CsharpTypeofResult } from "../../../target-model/types/runtime-kind.js";
import { getCsharpTypeofResult } from "./runtime-kind.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export function selectCsharpTypeofComparison(
  operandType: TargetTypeRef | undefined,
  runtimeKind: CsharpTypeofRuntimeKind,
  negated: boolean,
  definitions?: CsharpTypeDefinitions,
): CsharpTypeofComparisonSelection {
  if (operandType === undefined) {
    return rejected(
      "The selected typeof comparison has no exact target operand type.",
    );
  }
  const category = getCsharpTypeofResult(operandType, undefined, definitions);
  if (category === undefined) return rejected(
    "The selected typeof comparison has no exact closed target runtime-category representation.",
  );
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
    (runtimeKind === "object") !== negated,
    ...comparisonResults(category.value, runtimeKind, negated),
  ]);
  return new Set(category.arms.flatMap(arm => [...comparisonResults(arm.result, runtimeKind, negated)]));
}

function rejected(reason: string): CsharpTypeofComparisonSelection {
  return { kind: "rejected", reason };
}
