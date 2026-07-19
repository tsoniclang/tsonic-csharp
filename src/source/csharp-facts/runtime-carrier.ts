import type {
  ExtensionConsumerQueries,
  ExtensionEvidence,
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionFactWriteResult,
} from "@tsonic/tsts";
import {
  csharpPropagatedRuntimeCarrierFactKey,
} from "./keys.js";
import type {
  CsharpPropagatedRuntimeCarrierFact,
} from "./types.js";

export function getRecordedCsharpPropagatedRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: ExtensionFactSubject | undefined,
): CsharpPropagatedRuntimeCarrierFact | undefined {
  return facts.get(subject, csharpPropagatedRuntimeCarrierFactKey);
}

export function getConsumedCsharpPropagatedRuntimeCarrierFact(
  facts: ExtensionConsumerQueries,
  subject: ExtensionFactSubject | undefined,
): CsharpPropagatedRuntimeCarrierFact | undefined {
  return facts.getFact(subject, csharpPropagatedRuntimeCarrierFactKey);
}

export function recordCsharpPropagatedRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: ExtensionFactSubject,
  fact: CsharpPropagatedRuntimeCarrierFact,
  evidence: readonly ExtensionEvidence[] = [],
): ExtensionFactWriteResult {
  return facts.set(subject, csharpPropagatedRuntimeCarrierFactKey, fact, evidence);
}
