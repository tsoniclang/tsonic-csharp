// Groups the Host argument correspondence of a selected call onto a native parameter vector (nextgen C-2542).
// Argument → parameter correspondence, spread forms and the selected signature's parameter kinds are Host facts
// (facts.selections.call); this file decides only the C# parameter grouping (fixed slots, params arrays). Every
// authored argument (authored syntax: the call's argument list) must have its selected binding, as at baseline: an
// authored argument without one (`f(a, ...[])`) would otherwise lose its evaluation.
import type { SourceCallSelection } from "@tsonic/target-api/source";
import type { CsharpSourceArgumentGroup, CsharpSourceArgumentGrouping, CsharpSourceArgumentGroupingEntry } from "../../../target-model/records/operations/operations.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";

export function selectCsharpSourceArgumentGrouping(
  source: SourceCallSelection,
  parameters: readonly CsharpTargetParameter[] | undefined,
  argumentParameterTypes: readonly (TargetTypeRef | undefined)[] | undefined,
  authoredArgumentCount: number,
  exactArity = false,
): CsharpSourceArgumentGrouping {
  if (parameters === undefined) return Object.freeze({ kind: "unresolved",
    reason: "Source arguments require their finalized native parameter vector." });
  const bindings = source.arguments;
  if (argumentParameterTypes !== undefined && argumentParameterTypes.length !== bindings.length) {
    return Object.freeze({ kind: "inconsistent", reason: "Argument parameter types must correspond to every selected binding." });
  }
  const sourceParameters = source.parameters;
  if (parameters.some((parameter, index) => parameter.paramsArray === true && index !== parameters.length - 1) ||
    sourceParameters.some((parameter, index) => parameter.kind === "rest" && index !== sourceParameters.length - 1)) {
    return Object.freeze({ kind: "inconsistent", reason: "A rest slot must be the final parameter in its own contract." });
  }
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const sourceRestIndex = sourceParameters.findIndex(parameter => parameter.kind === "rest");
  const bindingsBySource: { readonly binding: SourceCallSelection["arguments"][number]; readonly index: number }[][] =
    Array.from({ length: authoredArgumentCount }, () => []);
  const effective = new Set<number>();
  for (const [index, binding] of bindings.entries()) {
    if (!Number.isSafeInteger(binding.argumentIndex) || binding.argumentIndex < 0 || binding.argumentIndex >= authoredArgumentCount ||
      !Number.isSafeInteger(binding.effectiveIndex) || binding.effectiveIndex < 0 || binding.effectiveIndex >= bindings.length ||
      effective.has(binding.effectiveIndex) || !Number.isSafeInteger(binding.parameterIndex) || binding.parameterIndex < 0) {
      return Object.freeze({ kind: "inconsistent", reason: "Selected argument keys must be complete, unique and within their source domains." });
    }
    effective.add(binding.effectiveIndex);
    bindingsBySource[binding.argumentIndex]!.push({ binding, index });
  }
  const entries: CsharpSourceArgumentGroupingEntry[] = [];
  const bound = new Set<number>();
  let nextEffective = 0;
  let previousParameter = -1;
  let tupleExpansion = false;
  let pending = false;
  for (const [sourceArgumentIndex, selectedBindings] of bindingsBySource.entries()) {
    if (selectedBindings.length === 0 || selectedBindings.length > 1 && selectedBindings.some(({ binding }) => binding.form !== "spread-element")) {
      return Object.freeze({ kind: "inconsistent", reason: "Every source argument needs its complete selected binding, never a duplicated value or a missing prefix." });
    }
    let nextTupleElement = 0;
    for (const { binding, index } of selectedBindings) {
      const sourceSlotIndex = sourceRestIndex < 0 ? binding.effectiveIndex : Math.min(sourceRestIndex, binding.effectiveIndex);
      const sourceParameter = sourceParameters[binding.parameterIndex];
      if (binding.effectiveIndex !== nextEffective || sourceParameter === undefined ||
        sourceSlotIndex !== binding.parameterIndex ||
        (binding.mode === "positional") === (sourceParameter.kind === "rest") ||
        binding.form === "spread-sequence" && sourceParameter.kind !== "rest" ||
        binding.form === "spread-element" && binding.spreadElement !== nextTupleElement ||
        binding.form !== "spread-element" && binding.spreadElement !== undefined) {
        return Object.freeze({ kind: "inconsistent", reason: "Source argument order, parameter provenance and spread identities must match the selected contract exactly." });
      }
      nextEffective += 1;
      if (binding.form === "spread-element") nextTupleElement += 1;
      const parameterIndex = restIndex < 0 ? binding.effectiveIndex : Math.min(restIndex, binding.effectiveIndex);
      const parameter = parameters[parameterIndex];
      if (parameter === undefined || binding.form === "spread-sequence" && parameter.paramsArray !== true) {
        return Object.freeze({ kind: "refused", reason: "The selected argument cannot bind the selected native parameter contract." });
      }
      if (parameterIndex < previousParameter || parameterIndex === previousParameter && parameter.paramsArray !== true) {
        return Object.freeze({ kind: "inconsistent", reason: "Native parameter bindings must preserve source order and bind fixed slots only once." });
      }
      previousParameter = parameterIndex;
      bound.add(parameterIndex);
      if (binding.form === "spread-element") tupleExpansion = true;
      const type = argumentParameterTypes?.[index];
      if (type === undefined) { pending = true; continue; }
      entries.push(Object.freeze({ binding, expression: binding.argument, sourceArgumentIndex,
        effectiveArgumentIndex: binding.effectiveIndex, sourceParameterIndex: binding.parameterIndex, parameterIndex,
        sourceForm: binding.form, type, parameter: Object.freeze({ name: parameter.name, type, passingMode: "by-value",
          ...(parameter.optional === true ? { optional: true } : {}),
          ...(parameter.paramsArray === true && binding.form === "spread-sequence" ? { paramsArray: true } : {}),
        }) }));
    }
  }
  if (parameters.some((parameter, index) => !bound.has(index) && parameter.optional !== true && parameter.paramsArray !== true)) {
    return Object.freeze({ kind: "refused", reason: "A required native parameter has no selected source argument." });
  }
  if (tupleExpansion) return Object.freeze({ kind: "refused", reason: "Source-owned tuple-spread arguments require an explicit expansion plan." });
  if (pending) return Object.freeze({ kind: "unresolved", reason: "Every selected source argument requires its finalized native parameter type." });
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
