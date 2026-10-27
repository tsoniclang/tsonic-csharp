import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeMemoryLayout } from "../../../../target-model/operations/native-memory.js";
import type { CsharpNativeLayoutEmission, CsharpNativeLayoutRecords } from "../../../../target-model/records/native/native-layout-emission.js";

export function createCsharpNativeLayoutProducer() {
  let open = true;
  const values = new WeakMap<CsharpNativeMemoryLayout, CsharpNativeLayoutEmission>();
  return Object.freeze({ publish(layout: CsharpNativeMemoryLayout, value: CsharpNativeLayoutEmission): void {
    if (!open || values.has(layout)) failTargetAnalysisInvariant("tsonic-csharp", "A native layout is published exactly once before sealing.");
    values.set(layout, Object.freeze(value));
  }, seal(): CsharpNativeLayoutRecords {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native layout emission seals exactly once.");
    open = false;
    return Object.freeze({ nativeLayoutEmission: Object.freeze({ get: (layout: CsharpNativeMemoryLayout) => values.get(layout) }) });
  } });
}
