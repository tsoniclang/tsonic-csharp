import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeEmission, CsharpTypeEmissionRecords } from "../../../../target-model/records/types/type-emission.js";
import { csharpTypeEmissionKey } from "../../../../target-model/records/types/type-emission.js";

export function createCsharpTypeEmissionProducer() {
  let open = true;
  const values = new Map<string, CsharpTypeEmission>();
  return Object.freeze({
    publish(carrier: TargetTypeRef, value: CsharpTypeEmission): void {
      const key = csharpTypeEmissionKey(carrier);
      if (!open || values.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "A native type emission is published exactly once before sealing.");
      values.set(key, Object.freeze(value));
    },
    seal(): CsharpTypeEmissionRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native type emission seals exactly once.");
      open = false;
      return Object.freeze({ typeEmission: Object.freeze({ get: (carrier: TargetTypeRef) => values.get(csharpTypeEmissionKey(carrier)) }) });
    },
  });
}
