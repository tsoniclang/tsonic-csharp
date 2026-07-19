import type {
  ExtensionEvidence,
  ExtensionFactSubject,
  Node,
} from "@tsonic/tsts";
import {
  recordCsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  CsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function setRuntimeCarrierFactIfAbsent(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  node: Node | undefined,
  fact: CsharpPropagatedRuntimeCarrierFact | undefined,
  message: string,
): void {
  setRuntimeCarrierFactIfUnresolved(lifecycleContext, node, fact, [{ message }]);
}

export function setRuntimeCarrierFactIfUnresolved(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  subject: ExtensionFactSubject | undefined,
  fact: CsharpPropagatedRuntimeCarrierFact | undefined,
  evidence: readonly ExtensionEvidence[],
): boolean {
  if (subject === undefined || fact === undefined) {
    return false;
  }
  const result = recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, subject, fact, evidence);
  return result === "inserted" || result === "idempotent";
}

export function setRuntimeCarrierFactIfLocallyAbsent(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  subject: ExtensionFactSubject | undefined,
  fact: CsharpPropagatedRuntimeCarrierFact,
  message: string,
): boolean {
  if (subject === undefined) {
    return false;
  }
  const result = recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, subject, fact, [{ message }]);
  return result === "inserted" || result === "idempotent";
}
