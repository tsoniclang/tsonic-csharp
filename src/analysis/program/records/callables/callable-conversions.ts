import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpDelegateContract, CsharpDelegateContractRecords } from "../../../../target-model/records/callables/callable-conversions.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";

export function createCsharpDelegateContractProducer() {
  const values = new Map<string, Map<string, CsharpDelegateContract>>();
  const records: CsharpDelegateContractRecords = Object.freeze({ delegateContract: Object.freeze({
    get: (source: TargetTypeRef, target: TargetTypeRef) => values.get(targetTypeRefKey(source))?.get(targetTypeRefKey(target)),
    nativeExtractions: () => Object.freeze([...values.values()].flatMap(targets => [...targets.values()]
      .flatMap(value => value.nativeExtraction === undefined ? [] : [value.nativeExtraction]))),
  }) });
  let open = true;
  const requireOpen = (): void => {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native delegate contracts are immutable after sealing.");
  };
  return Object.freeze({ records, requireOpen, publish(source: TargetTypeRef, target: TargetTypeRef, value: CsharpDelegateContract): void {
    requireOpen();
    const sourceKey = targetTypeRefKey(source);
    const targets = values.get(sourceKey) ?? new Map<string, CsharpDelegateContract>();
    const targetKey = targetTypeRefKey(target);
    if (targets.has(targetKey)) failTargetAnalysisInvariant("tsonic-csharp", "A native delegate conversion has one exact signature owner.");
    targets.set(targetKey, Object.freeze(value));
    values.set(sourceKey, targets);
  }, seal(): void {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native delegate contracts seal exactly once.");
    open = false;
  } });
}

export type CsharpDelegateContractProducer = ReturnType<typeof createCsharpDelegateContractProducer>;
