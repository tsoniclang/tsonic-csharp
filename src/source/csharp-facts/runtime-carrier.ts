import type {
  ExtensionConsumerQueries,
  ExtensionEvidence,
  ExtensionFactStore,
  ExtensionFactWriteResult,
  Node,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  asSemanticType,
} from "../fact-subjects.js";
import {
  csharpRuntimeCarrierFactKey,
} from "./keys.js";
import type {
  CsharpRuntimeCarrierFact,
} from "./types.js";

export type CsharpRuntimeCarrierFactSubject = Node | Type;

export function asCsharpRuntimeCarrierFactSubject(
  subject: unknown,
): CsharpRuntimeCarrierFactSubject | undefined {
  return asNodeSubject(subject) ?? asSemanticType(subject);
}

export function getRecordedCsharpRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: unknown,
): CsharpRuntimeCarrierFact | undefined {
  const exactSubject = asCsharpRuntimeCarrierFactSubject(subject);
  return exactSubject === undefined
    ? undefined
    : facts.get(exactSubject, csharpRuntimeCarrierFactKey);
}

export function getConsumedCsharpRuntimeCarrierFact(
  facts: ExtensionConsumerQueries,
  subject: unknown,
): CsharpRuntimeCarrierFact | undefined {
  const exactSubject = asCsharpRuntimeCarrierFactSubject(subject);
  return exactSubject === undefined
    ? undefined
    : facts.getFact(exactSubject, csharpRuntimeCarrierFactKey);
}

export function recordCsharpRuntimeCarrierFact(
  facts: ExtensionFactStore,
  subject: unknown,
  fact: CsharpRuntimeCarrierFact,
  evidence: readonly ExtensionEvidence[] = [],
): ExtensionFactWriteResult {
  const exactSubject = asCsharpRuntimeCarrierFactSubject(subject);
  if (exactSubject === undefined) {
    throw new Error("C# runtime-carrier facts require an exact source node or semantic type subject.");
  }
  return facts.set(exactSubject, csharpRuntimeCarrierFactKey, fact, evidence);
}
