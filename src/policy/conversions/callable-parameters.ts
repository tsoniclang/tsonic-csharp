import type { CsharpCallableParameterAdapter, CsharpCallableRestSegment, CsharpCallableValueAdapter } from "../../target-model/records/callable-adapters.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";

export function csharpCallableParameterConversionRequests(
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
): readonly { readonly source: TargetTypeRef; readonly target: TargetTypeRef }[] {
  const sources = new Map<string, TargetTypeRef>();
  const targets = new Map<string, TargetTypeRef>();
  for (const [parameters, types] of [[source, sources], [target, targets]] as const) {
    for (const parameter of parameters) {
      types.set(targetTypeRefKey(parameter.type), parameter.type);
      const element = restElement(parameter.type);
      if (parameter.paramsArray === true && element !== undefined) types.set(targetTypeRefKey(element), element);
      const present = parameter.optional === true ? getCsharpNullableElementTargetType(parameter.type) : undefined;
      if (present !== undefined) types.set(targetTypeRefKey(present), present);
    }
  }
  return Object.freeze([...sources.values()].flatMap(source => [...targets.values()].map(target => Object.freeze({ source, target }))));
}

export function selectCsharpCallableParameterAdapters(
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
  admitted: readonly CsharpCallableValueAdapter[],
): readonly CsharpCallableParameterAdapter[] | undefined {
  const valid = (parameters: readonly CsharpTargetParameter[]) => parameters.every((parameter, index) =>
    parameter.paramsArray !== true || index === parameters.length - 1 && restElement(parameter.type) !== undefined);
  if (!valid(source) || !valid(target)) return undefined;
  const conversions = new Map(admitted.map(adapter => [conversionKey(adapter.source, adapter.target), adapter]));
  const conversion = (source: TargetTypeRef, target: TargetTypeRef) => conversions.get(conversionKey(source, target));
  const same = source.length === target.length && source.every((parameter, index) =>
    parameter.passingMode === target[index]!.passingMode && parameter.paramsArray === target[index]!.paramsArray &&
    targetTypeRefEquals(parameter.type, target[index]!.type));
  if (same) {
    const adapters: CsharpCallableParameterAdapter[] = [];
    for (const [parameterIndex, parameter] of source.entries()) {
      const adapter = conversion(parameter.type, target[parameterIndex]!.type);
      if (adapter === undefined) return undefined;
      adapters.push(Object.freeze({ kind: "value", parameterIndex, adapter }));
    }
    return Object.freeze(adapters);
  }
  if (source.some(parameter => parameter.passingMode !== "by-value") ||
    target.some(parameter => parameter.passingMode !== "by-value")) return undefined;
  const adapters: CsharpCallableParameterAdapter[] = [];
  let sourceIndex = 0;
  let offset = 0;
  for (const [targetIndex, destination] of target.entries()) {
    const origin = source[sourceIndex];
    const direct = origin === undefined || offset !== 0 || origin.paramsArray !== destination.paramsArray ? undefined
      : conversion(origin.type, destination.type);
    if (direct !== undefined) {
      adapters.push(Object.freeze({ kind: "value", parameterIndex: sourceIndex++, adapter: direct }));
      continue;
    }
    if (destination.paramsArray === true) {
      const element = restElement(destination.type)!;
      const segments: CsharpCallableRestSegment[] = [];
      for (; sourceIndex < source.length; sourceIndex++) {
        const parameter = source[sourceIndex]!;
        if (parameter.optional === true) return undefined;
        const value = parameter.paramsArray === true ? restElement(parameter.type) : parameter.type;
        const adapter = value === undefined ? undefined : conversion(value, element);
        if (adapter === undefined) return undefined;
        segments.push(Object.freeze(parameter.paramsArray === true
          ? { kind: "sequence", parameterIndex: sourceIndex, offset, adapter }
          : { kind: "value", parameterIndex: sourceIndex, adapter }));
      }
      adapters.push(Object.freeze({ kind: "rest", target: destination.type, segments: Object.freeze(segments) }));
      continue;
    }
    if (origin === undefined) {
      if (destination.optional !== true) return undefined;
      adapters.push(Object.freeze({ kind: "omitted", parameterIndex: targetIndex }));
      continue;
    }
    if (origin.paramsArray !== true) return undefined;
    const element = restElement(origin.type)!;
    const value = destination.optional === true ? getCsharpNullableElementTargetType(destination.type) ?? destination.type : destination.type;
    const adapter = conversion(element, value);
    if (adapter === undefined) return undefined;
    adapters.push(Object.freeze({ kind: "rest-element", parameterIndex: sourceIndex, offset: offset++,
      optional: destination.optional === true, adapter }));
  }
  return Object.freeze(adapters);
}

function restElement(type: TargetTypeRef): TargetTypeRef | undefined {
  return type.kind === "array" ? type.element : getCsharpJsArrayElementTargetType(type);
}

function conversionKey(source: TargetTypeRef, target: TargetTypeRef): string {
  return JSON.stringify([targetTypeRefKey(source), targetTypeRefKey(target)]);
}
