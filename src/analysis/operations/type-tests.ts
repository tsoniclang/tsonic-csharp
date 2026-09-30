import type { CsharpClosedTypeTest } from "../../target-model/operations/type-tests.js";
import { csharpClosedTypeTestsEqual } from "../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";

export function csharpClosedTypeTestMatches(fact: CsharpClosedTypeTest): boolean {
  if (fact.sourceCarrier === undefined || fact.targetCarrier === undefined) return false;
  const expected = selectCsharpClosedTypeTestPlan(fact.sourceCarrier, fact.targetCarrier);
  return expected !== undefined && csharpClosedTypeTestsEqual(expected, fact.test);
}
