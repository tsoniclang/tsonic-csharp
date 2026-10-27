import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpClosedTypeTest } from "../../../../target-model/operations/type-tests.js";
import type { CsharpClosedTypeTestEmission, CsharpClosedTypeTestRecords } from "../../../../target-model/records/types/type-tests.js";

export function createCsharpClosedTypeTestProducer() {
  let open = true;
  const values = new WeakMap<CsharpClosedTypeTest, CsharpClosedTypeTestEmission>();
  return Object.freeze({
    publish(fact: CsharpClosedTypeTest, value: CsharpClosedTypeTestEmission): void {
      if (!open || values.has(fact)) failTargetAnalysisInvariant("tsonic-csharp", "A closed type-test plan has one producer before sealing.");
      values.set(fact, Object.freeze(value));
    },
    seal(): CsharpClosedTypeTestRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Closed type-test plans seal exactly once.");
      open = false;
      return Object.freeze({ closedTypeTestEmission: Object.freeze({ get: (fact: CsharpClosedTypeTest) => values.get(fact) }) });
    },
  });
}
