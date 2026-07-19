import type {
  ExtensionEvidence,
  ExtensionFactStore,
  ExtensionFactSubject,
  Node,
} from "@tsonic/tsts";
import {
  recordCsharpRuntimeCarrierFact,
} from "../csharp-facts.js";
import type {
  CsharpRuntimeCarrierFact,
} from "../csharp-facts.js";

type RuntimeCarrierFactWriteContext =
  | { readonly facts: ExtensionFactStore }
  | { readonly host: { readonly facts: ExtensionFactStore } };

export function setRuntimeCarrierFactIfAbsent(
  context: RuntimeCarrierFactWriteContext,
  node: Node | undefined,
  fact: CsharpRuntimeCarrierFact | undefined,
  message: string,
): void {
  setRuntimeCarrierFactIfUnresolved(context, node, fact, [{ message }]);
}

export function setRuntimeCarrierFactIfUnresolved(
  context: RuntimeCarrierFactWriteContext,
  subject: ExtensionFactSubject | undefined,
  fact: CsharpRuntimeCarrierFact | undefined,
  evidence: readonly ExtensionEvidence[],
): boolean {
  if (subject === undefined || fact === undefined) {
    return false;
  }
  const result = recordCsharpRuntimeCarrierFact(factStore(context), subject, fact, evidence);
  if (result === "inserted" || result === "idempotent") {
    return true;
  }
  throw new Error(`C# runtime-carrier fact write failed with '${result}'.`);
}

export function setRuntimeCarrierFactIfLocallyAbsent(
  context: RuntimeCarrierFactWriteContext,
  subject: ExtensionFactSubject | undefined,
  fact: CsharpRuntimeCarrierFact,
  message: string,
): boolean {
  return setRuntimeCarrierFactIfUnresolved(context, subject, fact, [{ message }]);
}

function factStore(context: RuntimeCarrierFactWriteContext): ExtensionFactStore {
  return "facts" in context ? context.facts : context.host.facts;
}
