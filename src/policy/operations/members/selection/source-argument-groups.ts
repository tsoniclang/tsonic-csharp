import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/source-calls.js";
import type { CsharpSourceArgumentGroup, CsharpSourceArgumentGrouping, CsharpSourceArgumentGroupingEntry } from "../../../../target-model/records/operations.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";

export function selectCsharpSourceArgumentGrouping(
  source: ResolvedSourceCallInfo,
  parameters: readonly CsharpTargetParameter[] | undefined,
  argumentParameterTypes: readonly (TargetTypeRef | undefined)[] | undefined,
  parameterSlots: ReturnType<SourceFileSemantics["operations"]["callParameterSlots"]>,
  exactArity = false,
): CsharpSourceArgumentGrouping {
  if (source.sourceSelectedSignatureKind !== "resolved" || parameters === undefined || parameterSlots === undefined) {
    return Object.freeze({ kind: "unresolved", reason: "Source arguments require their finalized checked and native parameter contracts." });
  }
  const bindings = source.sourceArgumentBindings;
  if (argumentParameterTypes !== undefined && argumentParameterTypes.length !== bindings.length) {
    return Object.freeze({ kind: "inconsistent", reason: "Argument parameter types must correspond to every checked binding." });
  }
  if (parameters.some((parameter, index) => parameter.paramsArray === true && index !== parameters.length - 1) ||
    parameterSlots.some((slot, index) => slot.form === "rest" && index !== parameterSlots.length - 1)) {
    return Object.freeze({ kind: "inconsistent", reason: "A rest slot must be the final parameter in its own contract." });
  }
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const sourceRestIndex = parameterSlots.findIndex(slot => slot.form === "rest");
  const sourceParameters = new Map<number, ResolvedSourceCallInfo["sourceSelectedSignatureParameters"][number]>();
  for (const parameter of source.sourceSelectedSignatureParameters) {
    if (!Number.isSafeInteger(parameter.parameterIndex) || parameter.parameterIndex < 0 || sourceParameters.has(parameter.parameterIndex)) {
      return Object.freeze({ kind: "inconsistent", reason: "Checked source parameter identities must be unique nonnegative indices." });
    }
    sourceParameters.set(parameter.parameterIndex, parameter);
  }
  const bindingsBySource: { readonly binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number]; readonly index: number }[][] =
    Array.from({ length: source.sourceArguments.length }, () => []);
  const effective = new Set<number>();
  for (const [index, binding] of bindings.entries()) {
    const sourceIndex = binding.sourceArgumentIndex;
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= source.sourceArguments.length ||
      !Number.isSafeInteger(binding.effectiveArgumentIndex) || binding.effectiveArgumentIndex < 0 || binding.effectiveArgumentIndex >= bindings.length ||
      effective.has(binding.effectiveArgumentIndex) || !Number.isSafeInteger(binding.sourceParameterIndex) || binding.sourceParameterIndex < 0) {
      return Object.freeze({ kind: "inconsistent", reason: "Checked argument keys must be complete, unique and within their source domains." });
    }
    effective.add(binding.effectiveArgumentIndex);
    bindingsBySource[sourceIndex]!.push({ binding, index });
  }
  const entries: CsharpSourceArgumentGroupingEntry[] = [];
  const bound = new Set<number>();
  let nextEffective = 0;
  let previousParameter = -1;
  let tupleExpansion = false;
  let pending = false;
  for (const [sourceArgumentIndex, argument] of source.sourceArguments.entries()) {
    const selectedBindings = bindingsBySource[sourceArgumentIndex]!;
    if (selectedBindings.length === 0 || selectedBindings.length > 1 && selectedBindings.some(({ binding }) => binding.sourceForm !== "spread-element")) {
      return Object.freeze({ kind: "inconsistent", reason: "Every source argument needs its complete checked binding, never a duplicated value or a missing prefix." });
    }
    let nextTupleElement = 0;
    for (const { binding, index } of selectedBindings) {
      const sourceSlotIndex = sourceRestIndex < 0 ? binding.effectiveArgumentIndex : Math.min(sourceRestIndex, binding.effectiveArgumentIndex);
      const sourceSlot = parameterSlots[sourceSlotIndex];
      const sourceParameter = sourceParameters.get(binding.sourceParameterIndex);
      if (binding.effectiveArgumentIndex !== nextEffective || sourceSlot === undefined || sourceParameter === undefined ||
        sourceSlot.sourceParameterIndex !== binding.sourceParameterIndex ||
        (binding.sourceParameterForm === "parameter") === sourceParameter.rest ||
        (binding.sourceForm === "spread-sequence") !== (binding.sourceParameterForm === "rest-sequence") ||
        binding.sourceForm === "spread-element" && binding.spreadElementIndex !== nextTupleElement ||
        binding.sourceForm !== "spread-element" && binding.spreadElementIndex !== undefined) {
        return Object.freeze({ kind: "inconsistent", reason: "Source argument order, parameter provenance and spread identities must match the checked contract exactly." });
      }
      nextEffective += 1;
      if (binding.sourceForm === "spread-element") nextTupleElement += 1;
      const parameterIndex = restIndex < 0 ? binding.effectiveArgumentIndex : Math.min(restIndex, binding.effectiveArgumentIndex);
      const parameter = parameters[parameterIndex];
      if (parameter === undefined || binding.sourceForm === "spread-sequence" && parameter.paramsArray !== true) {
        return Object.freeze({ kind: "refused", reason: "The checked argument cannot bind the selected native parameter contract." });
      }
      if (parameterIndex < previousParameter || parameterIndex === previousParameter && parameter.paramsArray !== true) {
        return Object.freeze({ kind: "inconsistent", reason: "Native parameter bindings must preserve source order and bind fixed slots only once." });
      }
      previousParameter = parameterIndex;
      bound.add(parameterIndex);
      if (binding.sourceForm === "spread-element") tupleExpansion = true;
      const type = argumentParameterTypes?.[index];
      if (type === undefined) { pending = true; continue; }
      entries.push(Object.freeze({ binding, expression: argument.expression, sourceArgumentIndex,
        effectiveArgumentIndex: binding.effectiveArgumentIndex, sourceParameterIndex: binding.sourceParameterIndex, parameterIndex,
        sourceForm: binding.sourceForm, type, parameter: Object.freeze({ name: parameter.name, type, passingMode: "by-value",
          ...(parameter.optional === true ? { optional: true } : {}),
          ...(parameter.paramsArray === true && binding.sourceForm === "spread-sequence" ? { paramsArray: true } : {}),
        }) }));
    }
  }
  if (parameters.some((parameter, index) => !bound.has(index) && parameter.optional !== true && parameter.paramsArray !== true)) {
    return Object.freeze({ kind: "refused", reason: "A required native parameter has no checked source argument." });
  }
  if (tupleExpansion) return Object.freeze({ kind: "refused", reason: "Source-owned tuple-spread arguments require an explicit expansion plan." });
  if (pending) return Object.freeze({ kind: "unresolved", reason: "Every checked source argument requires its finalized native parameter type." });
  const byParameter: CsharpSourceArgumentGroupingEntry[][] = Array.from({ length: parameters.length }, () => []);
  for (const entry of entries) byParameter[entry.parameterIndex]!.push(entry);
  const groups: CsharpSourceArgumentGroup[] = [];
  for (const [parameterIndex, parameter] of parameters.entries()) {
    const arguments_ = byParameter[parameterIndex]!;
    if (parameter.paramsArray !== true) {
      const entry = arguments_[0];
      if (entry !== undefined || exactArity) groups.push(sourceArgumentGroup(parameterIndex, entry?.type ?? parameter.type, false, arguments_));
    } else if (arguments_.length > 0 || exactArity) {
      if (!exactArity && arguments_.every(entry => entry.sourceForm !== "spread-sequence")) {
        for (const entry of arguments_) groups.push(sourceArgumentGroup(parameterIndex, entry.type, false, [entry]));
      } else groups.push(sourceArgumentGroup(parameterIndex, parameter.type,
        arguments_.length !== 1 || arguments_[0]!.sourceForm !== "spread-sequence", arguments_));
    }
  }
  return Object.freeze({ kind: "grouped", arguments: Object.freeze(entries), groups: Object.freeze(groups) });
}

function sourceArgumentGroup(
  parameterIndex: number,
  type: TargetTypeRef,
  collect: boolean,
  arguments_: readonly CsharpSourceArgumentGroupingEntry[],
): CsharpSourceArgumentGroup {
  return Object.freeze({ parameterIndex, type, collect, arguments: Object.freeze(arguments_.map(entry =>
    Object.freeze({ index: entry.sourceArgumentIndex, spread: entry.sourceForm === "spread-sequence" }))) });
}
