import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionFactSubject,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  RuntimeCarrierFact,
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function setRuntimeCarrierFactIfAbsent(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  node: Node | undefined,
  fact: RuntimeCarrierFact | undefined,
  message: string,
): void {
  setRuntimeCarrierFactIfUnresolved(lifecycleContext, node, fact, [{ message }]);
}

export function setRuntimeCarrierFactIfUnresolved(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  subject: ExtensionFactSubject | undefined,
  fact: RuntimeCarrierFact | undefined,
  evidence: readonly ExtensionEvidence[],
): boolean {
  if (subject === undefined || fact === undefined || getResolvedRuntimeCarrierFact(lifecycleContext, subject) !== undefined) {
    return false;
  }
  lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, fact, evidence);
  return true;
}

export function setRuntimeCarrierFactIfAbsentOrStronger(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  subject: ExtensionFactSubject | undefined,
  fact: { readonly carrier: TargetTypeRef },
  message: string,
): void {
  if (subject === undefined) {
    return;
  }
  const existing = lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey);
  if (existing !== undefined) {
    return;
  }
  lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, fact, [{ message }]);
}

function getResolvedRuntimeCarrierFact(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  subject: ExtensionFactSubject,
): RuntimeCarrierFact | undefined {
  return lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey) ??
    lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey);
}
