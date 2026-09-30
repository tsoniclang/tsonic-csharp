import type { CsharpClosedTypeTest } from "../../target-model/operations/type-tests.js";
import { csharpClosedTypeTestsEqual } from "../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";

export function csharpClosedTypeTestMatches(fact: CsharpClosedTypeTest, definitions?: CsharpTypeDefinitions): boolean {
  if (fact.sourceCarrier === undefined || fact.targetCarrier === undefined) return false;
  const expected = selectCsharpClosedTypeTestPlan(fact.sourceCarrier, fact.targetCarrier, undefined, definitions);
  return expected !== undefined && csharpClosedTypeTestsEqual(expected, fact.test);
}
