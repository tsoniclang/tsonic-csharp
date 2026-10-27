import type { CsharpSelectedTargetCall, CsharpProviderArgumentMapping } from "../../../target-model/records/objects/members.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceArgumentGrouping } from "../../../target-model/records/operations/operations.js";
import type { CsharpNativeArgumentBinding, CsharpNativeArgumentBindings } from "../../../target-model/records/native/native-demand.js";

function argumentBinding(sourceIndex: number, effectiveIndex: number, parameterIndex: number, sequence: boolean,
  sourceParameterIndex?: number): CsharpNativeArgumentBinding {
  return Object.freeze({ sourceArgumentIndex: sourceIndex, sequence,
    slot: Object.freeze({ kind: "argument", sourceIndex, effectiveIndex, parameterIndex,
      ...(sourceParameterIndex === undefined ? {} : { sourceParameterIndex }) }) });
}

export function csharpSelectedTargetArgumentBindings(call: CsharpSelectedTargetCall): CsharpNativeArgumentBindings {
  const sequences = new Map<number, NonNullable<CsharpSelectedTargetCall["sequenceArguments"]>[number]>();
  const inconsistent = (sourceArgumentIndex: number, reason: string): CsharpNativeArgumentBindings =>
    Object.freeze({ kind: "inconsistent", sourceArgumentIndex, reason });
  for (const sequence of call.sequenceArguments ?? []) {
    if (sequences.has(sequence.sourceArgumentIndex)) return inconsistent(sequence.sourceArgumentIndex,
      "A selected source argument has more than one sequence contract.");
    sequences.set(sequence.sourceArgumentIndex, sequence);
  }
  const boundSequences = new Set<number>();
  const effectiveBySource = new Map<number, Set<number>>();
  const bindings: CsharpNativeArgumentBinding[] = [];
  for (const selected of call.arguments) {
    const effective = effectiveBySource.get(selected.sourceArgumentIndex) ?? new Set<number>();
    if (effective.has(selected.effectiveArgumentIndex)) return inconsistent(selected.sourceArgumentIndex,
      "Selected argument uses require distinct source/effective identities.");
    effective.add(selected.effectiveArgumentIndex);
    effectiveBySource.set(selected.sourceArgumentIndex, effective);
    const sequence = sequences.get(selected.sourceArgumentIndex);
    if (sequence !== undefined && sequence.targetParameterIndex !== selected.targetParameterIndex) {
      return inconsistent(selected.sourceArgumentIndex, "A selected sequence and argument name different native parameters.");
    }
    if (sequence !== undefined && boundSequences.has(selected.sourceArgumentIndex)) continue;
    if (sequence !== undefined) boundSequences.add(selected.sourceArgumentIndex);
    bindings.push(argumentBinding(selected.sourceArgumentIndex, selected.effectiveArgumentIndex, selected.targetParameterIndex,
      sequence !== undefined));
  }
  for (const sourceArgumentIndex of sequences.keys()) {
    if (!boundSequences.has(sourceArgumentIndex)) return inconsistent(sourceArgumentIndex,
      "A selected sequence requires its complete argument binding.");
  }
  return Object.freeze({ kind: "bound", bindings: Object.freeze(bindings) });
}

export function csharpSourceOwnedArgumentBindings(grouping: CsharpSourceArgumentGrouping | undefined): CsharpNativeArgumentBindings {
  if (grouping === undefined) return Object.freeze({ kind: "unresolved", reason: "The selected source argument grouping is not finalized." });
  if (grouping.kind !== "grouped") return grouping;
  return Object.freeze({ kind: "bound", bindings: Object.freeze(grouping.arguments.map(entry =>
    argumentBinding(entry.sourceArgumentIndex, entry.effectiveArgumentIndex, entry.parameterIndex,
      entry.sourceForm === "spread-sequence", entry.sourceParameterIndex))) });
}

export function csharpProviderArgumentSourceCarrier(mapping: CsharpProviderArgumentMapping | undefined): TargetTypeRef | undefined {
  if (mapping?.kind !== "by-value") return undefined;
  switch (mapping.conversion.kind) {
    case "provider-argument-adapter":
    case "lifted-provider-argument-adapter":
    case "checked-native-integer": return mapping.sourceType;
    case "delegate-adapter": return mapping.conversion.strategy === "adaptation" ? mapping.sourceType : undefined;
    default: return undefined;
  }
}
