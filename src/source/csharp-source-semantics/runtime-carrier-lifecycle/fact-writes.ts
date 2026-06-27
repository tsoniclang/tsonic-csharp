import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  RuntimeCarrierFact,
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  shouldReplaceUseSiteRuntimeCarrier,
} from "./fact-strength.js";

export function setRuntimeCarrierFactIfAbsent(
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"] },
  node: Node | undefined,
  fact: RuntimeCarrierFact | undefined,
  message: string,
): void {
  if (node === undefined || fact === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, [{ message }]);
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
  if (existing !== undefined && !shouldReplaceUseSiteRuntimeCarrier(existing.carrier, fact.carrier)) {
    return;
  }
  lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, fact, [{ message }]);
}
