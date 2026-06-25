import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  shouldReplaceUseSiteRuntimeCarrier,
} from "./fact-strength.js";
import {
  getReferencedRuntimeCarrierTargetTypeRef,
} from "./referenced-facts.js";

export function propagateCsharpRuntimeCarrierFactFromReferencedSymbol(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
): void {
  const carrier = getReferencedRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node);
  if (carrier === undefined) {
    return;
  }
  const existing = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey);
  if (existing !== undefined && !shouldReplaceUseSiteRuntimeCarrier(existing.carrier, carrier)) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
    carrier,
  }, [{ message: "C# runtime carrier propagated from finalized referenced declaration facts." }]);
}
