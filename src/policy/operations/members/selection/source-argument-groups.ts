import type { ResolvedSourceCallInfo } from "../../../../target-model/records/members.js";
import type { CsharpSourceArgumentGrouping, CsharpSourceArgumentGroupingEntry } from "../../../../target-model/records/operations.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";

const refused: CsharpSourceArgumentGrouping = Object.freeze({ kind: "refused" });
const unresolved: CsharpSourceArgumentGrouping = Object.freeze({ kind: "unresolved" });

export function selectCsharpSourceArgumentGrouping(
  source: ResolvedSourceCallInfo,
  parameters: readonly CsharpTargetParameter[] | undefined,
  argumentParameterTypes: readonly (TargetTypeRef | undefined)[] | undefined,
): CsharpSourceArgumentGrouping {
  if (parameters === undefined) return unresolved;
  const restIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  const entries: CsharpSourceArgumentGroupingEntry[] = [];
  let previousParameter = -1;
  for (const [index] of source.sourceArguments.entries()) {
    const bindings = source.sourceArgumentBindings.filter(binding => binding.sourceArgumentIndex === index);
    const binding = bindings[0];
    if (binding === undefined || bindings.length !== 1 || binding.sourceForm === "spread-element") return refused;
    const parameterIndex = restIndex < 0 ? binding.effectiveArgumentIndex : Math.min(restIndex, binding.effectiveArgumentIndex);
    const parameter = parameters[parameterIndex];
    const type = argumentParameterTypes?.[source.sourceArgumentBindings.indexOf(binding)];
    if (parameter === undefined || parameterIndex < previousParameter) return refused;
    if (type === undefined) return unresolved;
    const spread = binding.sourceForm === "spread-sequence";
    if (spread && parameter.paramsArray !== true) return refused;
    entries.push(Object.freeze({ sourceArgumentIndex: index, effectiveArgumentIndex: binding.effectiveArgumentIndex, parameterIndex, spread, type }));
    previousParameter = parameterIndex;
  }
  const bound = new Set(entries.map(entry => entry.parameterIndex));
  if (parameters.some((parameter, parameterIndex) => !bound.has(parameterIndex) && parameter.paramsArray !== true &&
    parameter.optional !== true)) return refused;
  return Object.freeze({ kind: "grouped", arguments: Object.freeze(entries) });
}
