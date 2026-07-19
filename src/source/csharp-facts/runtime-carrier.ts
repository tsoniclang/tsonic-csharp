import type {
  ExtensionConsumerQueries,
  ExtensionEvidence,
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionFactWriteResult,
} from "@tsonic/tsts";
import {
  csharpRuntimeCarrierFactKey,
} from "./keys.js";
import type {
  CsharpRuntimeCarrierFact,
} from "./types.js";

export function getRecordedCsharpRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: ExtensionFactSubject | undefined,
): CsharpRuntimeCarrierFact | undefined {
  return facts.get(subject, csharpRuntimeCarrierFactKey);
}

export function getConsumedCsharpRuntimeCarrierFact(
  facts: ExtensionConsumerQueries,
  subject: ExtensionFactSubject | undefined,
): CsharpRuntimeCarrierFact | undefined {
  return facts.getFact(subject, csharpRuntimeCarrierFactKey);
}

export function recordCsharpRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: ExtensionFactSubject,
  fact: CsharpRuntimeCarrierFact,
  evidence: readonly ExtensionEvidence[] = [],
): ExtensionFactWriteResult {
  return facts.set(subject, csharpRuntimeCarrierFactKey, fact, evidence);
}
