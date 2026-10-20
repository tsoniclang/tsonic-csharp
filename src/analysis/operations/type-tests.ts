import type { CsharpClosedTypeTest } from "../../target-model/operations/type-tests.js";
import { csharpClosedTypeTestsEqual } from "../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../policy/operations/operators/type-tests.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { isCsharpTargetTypeRef } from "../../target-model/types/snapshot.js";

export function csharpClosedTypeTestMatches(fact: CsharpClosedTypeTest, definitions?: CsharpTypeDefinitions): boolean {
  const predicate = fact.predicate;
  if (!isCsharpTargetTypeRef(fact.sourceCarrier) || typeof predicate !== "object" || predicate === null ||
    !(predicate.kind === "array" ? Object.keys(predicate).length === 1
      : predicate.kind === "nominal" && isCsharpTargetTypeRef(predicate.targetCarrier) && Object.keys(predicate).length === 2)) return false;
  const expected = selectCsharpClosedTypeTestPlan(fact.sourceCarrier, predicate, undefined, definitions);
  return expected !== undefined && csharpClosedTypeTestsEqual(expected, fact.test);
}
