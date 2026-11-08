import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpSourceArgumentGroup, CsharpSourceArgumentGrouping, CsharpSourceArgumentGroupingEntry } from "../../../target-model/records/operations/operations.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import { csharpTargetParameterValueType } from "../../../target-model/types/member-facts.js";

export function selectCsharpSourceArgumentGrouping(
  source: SourceApplication,
  parameters: readonly CsharpTargetParameter[],
): CsharpSourceArgumentGrouping {
  const inconsistent = (reason: string): CsharpSourceArgumentGrouping => Object.freeze({ kind: "inconsistent", reason });
  const refused = (reason: string): CsharpSourceArgumentGrouping => Object.freeze({ kind: "refused", reason });
  if (source.argumentDisposition === "skip") {
    return source.arguments.length === 0
      ? Object.freeze({ kind: "grouped", arguments: Object.freeze([]), groups: Object.freeze([]) })
      : inconsistent("A Source-skipped invocation cannot publish effective parameter bindings.");
  }
  for (const authored of source.sourceArguments) {
    if (authored.operand.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: authored.operand });
  }
  const rest = parameters.flatMap((parameter, index) => parameter.paramsArray === true ? [index] : []);
  if (rest.length > 1 || rest[0] !== undefined && rest[0] !== parameters.length - 1) {
    return inconsistent("The selected Native ABI requires one final params parameter.");
  }
  const entries: CsharpSourceArgumentGroupingEntry[] = [];
  const byParameter: number[][] = Array.from({ length: parameters.length }, () => []);
  const bySource: number[] = Array.from({ length: source.sourceArguments.length }, () => 0);
  const effectiveIndexes = new Set<number>();
  const extractionIndexes = new Map<number, Set<number>>();
  let previousEffective = -1;
  for (const binding of source.arguments) {
    const authored = source.sourceArguments[binding.sourceArgumentIndex];
    if (authored === undefined || authored.operand.kind !== "resolved" || authored.occurrence !== binding.sourceArgument ||
      binding.parameter.signature !== source.identity.signature ||
      !Number.isSafeInteger(binding.effectiveArgumentIndex) || binding.effectiveArgumentIndex < 0 ||
      binding.effectiveArgumentIndex !== previousEffective + 1 || effectiveIndexes.has(binding.effectiveArgumentIndex) ||
      !Number.isSafeInteger(binding.parameter.index) || binding.parameter.index < 0 ||
      (binding.sourceForm === "value") !== (authored.form === "value")) {
      return inconsistent("Each Native argument binding requires its identical original Source place and authored argument.");
    }
    previousEffective = binding.effectiveArgumentIndex;
    effectiveIndexes.add(binding.effectiveArgumentIndex);
    bySource[binding.sourceArgumentIndex]! += 1;
    if (binding.sourceForm === "spread-element") {
      const index = binding.spreadElementIndex;
      const seen = extractionIndexes.get(binding.sourceArgumentIndex) ?? new Set<number>();
      if (index === undefined || !Number.isSafeInteger(index) || index < 0 || seen.has(index)) {
        return inconsistent("A tuple argument binding requires its exact distinct Source extraction index.");
      }
      seen.add(index);
      extractionIndexes.set(binding.sourceArgumentIndex, seen);
    } else if (binding.spreadElementIndex !== undefined) {
      return inconsistent("Only a Source tuple element can carry a tuple extraction index.");
    }
    const parameterIndex = rest[0] !== undefined && binding.effectiveArgumentIndex >= rest[0]
      ? rest[0] : binding.effectiveArgumentIndex;
    const parameter = parameters[parameterIndex];
    if (parameter === undefined || binding.sourceForm === "spread-sequence" && parameter.paramsArray !== true) {
      return refused("The published Source place cannot bind the selected physical Native parameter vector.");
    }
    if (parameter.paramsArray !== true && byParameter[parameterIndex]!.length !== 0) {
      return inconsistent("A fixed Native parameter cannot receive two effective Source arguments.");
    }
    const type = csharpTargetParameterValueType(parameter, binding.sourceForm);
    const index = entries.length;
    entries.push(Object.freeze({ binding, expression: authored.operand.value.occurrence,
      sourceArgumentIndex: binding.sourceArgumentIndex, effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceParameterIndex: binding.parameter.index, parameterIndex, sourceForm: binding.sourceForm, type,
      parameter: Object.freeze({ ...parameter, type,
        ...(binding.sourceForm === "spread-sequence" ? {} : { paramsArray: false }) }) }));
    byParameter[parameterIndex]!.push(index);
  }
  for (const [index, authored] of source.sourceArguments.entries()) {
    if (authored.form === "value" && bySource[index] !== 1) {
      return inconsistent("An authored scalar argument requires its Source binding; an empty spread does not.");
    }
  }
  const groups: CsharpSourceArgumentGroup[] = [];
  for (const [parameterIndex, parameter] of parameters.entries()) {
    const indexes = byParameter[parameterIndex]!;
    if (indexes.length === 0 && parameter.optional !== true && parameter.paramsArray !== true) {
      return refused("A required physical Native parameter has no published Source argument.");
    }
    const sequence = indexes.length === 1 && entries[indexes[0]!]!.sourceForm === "spread-sequence";
    groups.push(Object.freeze({ parameterIndex, type: parameter.type,
      collect: parameter.paramsArray === true && !sequence,
      arguments: Object.freeze(indexes.map(index => Object.freeze({ index,
        spread: entries[index]!.sourceForm === "spread-sequence" }))) }));
  }
  return Object.freeze({ kind: "grouped", arguments: Object.freeze(entries), groups: Object.freeze(groups) });
}
