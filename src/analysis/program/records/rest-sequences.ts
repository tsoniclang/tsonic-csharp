import type { CsharpRestSequence, CsharpRestSequenceEmission, CsharpRestSequenceRecords } from "../../../target-model/records/rest-sequences.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpRestSequenceRecords(entries: ReadonlyMap<CsharpRestSequence, CsharpRestSequenceEmission>): CsharpRestSequenceRecords {
  const values = new WeakMap<CsharpRestSequence, CsharpRestSequenceEmission>();
  for (const [sequence, value] of entries) {
    if (values.has(sequence)) failTargetAnalysisInvariant("tsonic-csharp", "A selected rest sequence has one native emission owner.", sequence.expression);
    values.set(sequence, Object.freeze(value));
  }
  return Object.freeze({ restSequence: Object.freeze({ get: (sequence: CsharpRestSequence) => values.get(sequence) }) });
}
