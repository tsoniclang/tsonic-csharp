// Planner unit fixtures read the same record families the analysis publishes. These builders produce those records
// with the analysis's own producers, so a fixture never hand-writes a decision the analysis owns.
import { analyzeCsharpTypeEmission } from "../../dist/analysis/types/emission.js";
import { admitCsharpDelegateEmission } from "../../dist/analysis/conversions/callable-emission.js";
import { createCsharpDelegateContractProducer } from "../../dist/analysis/program/records/callable-conversions.js";

// records.typeEmission for any queried carrier, computed by analyzeCsharpTypeEmission over that carrier alone.
// targetShapes: the object-shape facts by targetTypeRefKey that the carrier may reach.
export function csharpTypeEmissionRecord({ targetShapes = {}, languageDialect = "csharp14" } = {}) {
  return Object.freeze({ get(carrier) {
    if (carrier === undefined) return undefined;
    const analysis = analyzeCsharpTypeEmission({ ast: { parent: () => undefined }, nodes: [], languageDialect, extraTypes: [carrier],
      evidence: { targetTypes: [], typeParameterConstraints: { get: () => undefined } },
      values: { valueRead: { get: () => undefined } }, storage: { storageType: { get: () => undefined } },
      shapes: { targetShapes }, admitted: () => false });
    return analysis.records.typeEmission.get(carrier);
  } });
}

// records.delegateContract for exactly the admitted [source, target, selection] conversions.
export function csharpDelegateContractRecord(conversions) {
  const producer = createCsharpDelegateContractProducer();
  for (const [source, target, selection] of conversions) admitCsharpDelegateEmission(producer, source, target, selection);
  producer.seal();
  return producer.records.delegateContract;
}
