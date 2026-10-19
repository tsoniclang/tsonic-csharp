import type { CsharpCallableParameterAdapter, CsharpCallableRestSegment, CsharpCallableValueAdapter } from "../../target-model/records/callable-adapters.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpJsArrayElementTargetType, getCsharpIndexableLengthMemberName } from "../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";

export function csharpCallableParameterConversionRequests(
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
): readonly { readonly source: TargetTypeRef; readonly target: TargetTypeRef }[] {
  const requests = new Map<string, { readonly source: TargetTypeRef; readonly target: TargetTypeRef }>();
  const request = (source: TargetTypeRef, target: TargetTypeRef): void => {
    requests.set(conversionKey(source, target), Object.freeze({ source, target }));
  };
  if (!validParameters(source) || !validParameters(target)) return Object.freeze([]);
  if (sameParameters(source, target)) {
    source.forEach((parameter, index) => request(parameter.type, target[index]!.type));
    return Object.freeze([...requests.values()]);
  }
  if (source.some(parameter => parameter.passingMode !== "by-value") || target.some(parameter => parameter.passingMode !== "by-value")) {
    return Object.freeze([]);
  }
  let sourceIndex = 0;
  let offset = 0;
  for (const destination of target) {
    const origin = source[sourceIndex];
    if (destination.paramsArray === true) {
      if (origin?.paramsArray === true && offset === 0) request(origin.type, destination.type);
      const element = restElement(destination.type)!;
      for (; sourceIndex < source.length; sourceIndex++) {
        const parameter = source[sourceIndex]!;
        if (parameter.optional === true) break;
        request(parameter.paramsArray === true ? restElement(parameter.type)! : parameter.type, element);
      }
      break;
    }
    if (origin === undefined) continue;
    if (origin.paramsArray === true) {
      request(restElement(origin.type)!, destination.optional === true
        ? getCsharpNullableElementTargetType(destination.type) ?? destination.type : destination.type);
      offset++;
    } else {
      request(origin.type, destination.type);
      sourceIndex++;
    }
  }
  return Object.freeze([...requests.values()]);
}

export function selectCsharpCallableParameterAdapters(
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
  admitted: readonly CsharpCallableValueAdapter[],
): readonly CsharpCallableParameterAdapter[] | undefined {
  if (!validParameters(source) || !validParameters(target)) return undefined;
  const conversions = new Map(admitted.map(adapter => [conversionKey(adapter.source, adapter.target), adapter]));
  const conversion = (source: TargetTypeRef, target: TargetTypeRef) => conversions.get(conversionKey(source, target));
  if (sameParameters(source, target)) {
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
    const direct = origin === undefined || offset !== 0 || (origin.paramsArray === true) !== (destination.paramsArray === true) ? undefined
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
        const lengthMember = parameter.paramsArray === true ? getCsharpIndexableLengthMemberName(parameter.type) : undefined;
        if (parameter.paramsArray === true && lengthMember === undefined) return undefined;
        segments.push(Object.freeze(parameter.paramsArray === true
          ? { kind: "sequence", parameterIndex: sourceIndex, offset, lengthMember: lengthMember!, adapter }
          : { kind: "value", parameterIndex: sourceIndex, adapter }));
      }
      adapters.push(Object.freeze({ kind: "rest", target: destination.type, element,
        collection: destination.type.kind === "array" ? "array" : "js-array", segments: Object.freeze(segments) }));
      continue;
    }
    if (origin === undefined) {
      if (destination.optional !== true) return undefined;
      adapters.push(Object.freeze({ kind: "omitted", parameterIndex: targetIndex }));
      continue;
    }
    if (origin.paramsArray !== true) return undefined;
    const lengthMember = getCsharpIndexableLengthMemberName(origin.type);
    if (lengthMember === undefined) return undefined;
    const element = restElement(origin.type)!;
    const value = destination.optional === true ? getCsharpNullableElementTargetType(destination.type) ?? destination.type : destination.type;
    const adapter = conversion(element, value);
    if (adapter === undefined) return undefined;
    adapters.push(Object.freeze({ kind: "rest-element", parameterIndex: sourceIndex, offset: offset++,
      optional: destination.optional === true, lengthMember, adapter }));
  }
  return Object.freeze(adapters);
}

function restElement(type: TargetTypeRef): TargetTypeRef | undefined {
  return type.kind === "array" ? type.element : getCsharpJsArrayElementTargetType(type);
}

function conversionKey(source: TargetTypeRef, target: TargetTypeRef): string {
  return JSON.stringify([targetTypeRefKey(source), targetTypeRefKey(target)]);
}

function validParameters(parameters: readonly CsharpTargetParameter[]): boolean {
  return parameters.every((parameter, index) => parameter.paramsArray !== true ||
    index === parameters.length - 1 && restElement(parameter.type) !== undefined);
}

function sameParameters(source: readonly CsharpTargetParameter[], target: readonly CsharpTargetParameter[]): boolean {
  return source.length === target.length && source.every((parameter, index) =>
    parameter.passingMode === target[index]!.passingMode && (parameter.paramsArray === true) === (target[index]!.paramsArray === true) &&
    targetTypeRefEquals(parameter.type, target[index]!.type));
}
