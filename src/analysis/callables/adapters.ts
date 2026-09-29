import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpConversionIsApplicable, selectCsharpConversion, type CsharpConversionSelection } from "../../policy/conversions/selection.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/collections.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/index.js";

export interface CsharpCallableValueAdapter {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpCallableRestSegment =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "sequence"; readonly parameterIndex: number; readonly offset: number; readonly adapter: CsharpCallableValueAdapter };

export type CsharpCallableParameterAdapter =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "omitted"; readonly parameterIndex: number }
  | { readonly kind: "rest-element"; readonly parameterIndex: number; readonly offset: number;
      readonly optional: boolean; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "rest"; readonly target: TargetTypeRef; readonly segments: readonly CsharpCallableRestSegment[] };

export function csharpCallableRestElement(type: TargetTypeRef): TargetTypeRef | undefined {
  return type.kind === "array" ? type.element : getCsharpJsArrayElementTargetType(type);
}

export function selectCsharpCallableValueAdapter(
  policy: CsharpPolicyContext, source: TargetTypeRef, target: TargetTypeRef,
): CsharpCallableValueAdapter | undefined {
  const conversion = selectCsharpConversion(policy, source, target, "implicit");
  return csharpConversionIsApplicable(conversion, "implicit")
    ? Object.freeze({ source, target, conversion }) : undefined;
}

export function selectCsharpCallableParameterAdapters(
  policy: CsharpPolicyContext,
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
): readonly CsharpCallableParameterAdapter[] | undefined {
  const valid = (parameters: readonly CsharpTargetParameter[]) => parameters.every((parameter, index) =>
    parameter.passingMode === "by-value" && (parameter.paramsArray !== true ||
      index === parameters.length - 1 && csharpCallableRestElement(parameter.type) !== undefined));
  if (!valid(source) || !valid(target)) return undefined;
  const adapters: CsharpCallableParameterAdapter[] = [];
  let sourceIndex = 0;
  let offset = 0;
  for (const [targetIndex, destination] of target.entries()) {
    const origin = source[sourceIndex];
    const direct = origin === undefined || offset !== 0 || origin.paramsArray !== destination.paramsArray ? undefined
      : selectCsharpCallableValueAdapter(policy, origin.type, destination.type);
    if (direct !== undefined) {
      adapters.push(Object.freeze({ kind: "value", parameterIndex: sourceIndex++, adapter: direct }));
      continue;
    }
    if (destination.paramsArray === true) {
      const element = csharpCallableRestElement(destination.type)!;
      const segments: CsharpCallableRestSegment[] = [];
      for (; sourceIndex < source.length; sourceIndex++) {
        const parameter = source[sourceIndex]!;
        if (parameter.optional === true) return undefined;
        const value = parameter.paramsArray === true ? csharpCallableRestElement(parameter.type) : parameter.type;
        const adapter = value === undefined ? undefined : selectCsharpCallableValueAdapter(policy, value, element);
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
    const element = csharpCallableRestElement(origin.type)!;
    const value = destination.optional === true ? getCsharpNullableElementTargetType(destination.type) ?? destination.type : destination.type;
    const adapter = selectCsharpCallableValueAdapter(policy, element, value);
    if (adapter === undefined) return undefined;
    adapters.push(Object.freeze({ kind: "rest-element", parameterIndex: sourceIndex, offset: offset++,
      optional: destination.optional === true, adapter }));
  }
  return Object.freeze(adapters);
}
