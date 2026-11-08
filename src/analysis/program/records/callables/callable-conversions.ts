import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpDelegateContract, CsharpDelegateContractRecords } from "../../../../target-model/records/callables/callable-conversions.js";
import { csharpNativeCallableConversionKey } from "../../../../target-model/records/callables/callable-conversions.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";

export function createCsharpDelegateContractProducer() {
  const values = new Map<string, Map<string, Map<string, CsharpDelegateContract>>>();
  const records: CsharpDelegateContractRecords = Object.freeze({ delegateContract: Object.freeze({
    get: (source, target, members) => values.get(targetTypeRefKey(source))?.get(targetTypeRefKey(target))?.get(csharpNativeCallableConversionKey(members)),
  }) });
  let open = true;
  return Object.freeze({ records, publish(source: TargetTypeRef, target: TargetTypeRef, value: CsharpDelegateContract): void {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native delegate contracts are immutable after sealing.");
    const sourceKey = targetTypeRefKey(source);
    const targets = values.get(sourceKey) ?? new Map<string, Map<string, CsharpDelegateContract>>();
    const targetKey = targetTypeRefKey(target);
    const members = targets.get(targetKey) ?? new Map<string, CsharpDelegateContract>();
    const memberKey = csharpNativeCallableConversionKey(value.members);
    if (members.has(memberKey)) failTargetAnalysisInvariant("tsonic-csharp", "A native delegate conversion has one exact selected member owner.");
    members.set(memberKey, Object.freeze(value));
    targets.set(targetKey, members);
    values.set(sourceKey, targets);
  }, seal(): void {
    if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native delegate contracts seal exactly once.");
    open = false;
  } });
}

export type CsharpDelegateContractProducer = ReturnType<typeof createCsharpDelegateContractProducer>;
