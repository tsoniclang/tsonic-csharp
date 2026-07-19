import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  getRecordedCsharpPropagatedRuntimeCarrierFact,
  recordCsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
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
  const existing = getRecordedCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, node);
  if (existing !== undefined) {
    return;
  }
  recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, node, {
    carrier,
  }, [{ message: "C# runtime carrier propagated from finalized referenced declaration facts." }]);
}
