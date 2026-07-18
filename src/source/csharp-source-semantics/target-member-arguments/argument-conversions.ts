import type {
  SourceSelectedCallArgumentBinding,
  TargetCallArgumentConversionSlot,
} from "@tsonic/tsts";
import type {
  CsharpTargetParameter,
} from "../target-types.js";
import {
  getParameterForArgument,
  targetArityMatches,
} from "./arity.js";

export function getTargetArgumentConversionSlots(
  parameters: readonly CsharpTargetParameter[],
  request: {
    readonly argumentCount: number;
    readonly sourceArgumentBindings?: readonly SourceSelectedCallArgumentBinding[];
  },
): readonly TargetCallArgumentConversionSlot[] | undefined {
  const bindings = request.sourceArgumentBindings;
  if (request.argumentCount === 0) {
    return targetArityMatches(parameters, 0) ? [] : undefined;
  }
  if (bindings === undefined || bindings.length === 0) {
    return undefined;
  }
  const representedArguments = new Set(bindings.map((binding) => binding.sourceArgumentIndex));
  if (
    representedArguments.size !== request.argumentCount ||
    [...representedArguments].some((index) => index < 0 || index >= request.argumentCount)
  ) {
    return undefined;
  }
  const effectiveArgumentCount = Math.max(...bindings.map((binding) => binding.effectiveArgumentIndex)) + 1;
  if (!targetArityMatches(parameters, effectiveArgumentCount)) {
    return undefined;
  }
  const slots: TargetCallArgumentConversionSlot[] = [];
  for (const binding of bindings) {
    const slot = targetArgumentConversionSlot(parameters, binding);
    if (slot === undefined) {
      return undefined;
    }
    slots.push(slot);
  }
  return slots;
}

function targetArgumentConversionSlot(
  parameters: readonly CsharpTargetParameter[],
  binding: SourceSelectedCallArgumentBinding,
): TargetCallArgumentConversionSlot | undefined {
  const parameter = getParameterForArgument(parameters, binding.effectiveArgumentIndex);
  if (parameter === undefined) {
    return undefined;
  }
  const targetParameterIndex = parameters.indexOf(parameter);
  if (targetParameterIndex < 0 || (binding.sourceForm === "spread-sequence" && parameter.paramsArray !== true)) {
    return undefined;
  }
  return {
    sourceArgumentIndex: binding.sourceArgumentIndex,
    sourceForm: binding.sourceForm,
    ...(binding.spreadElementIndex === undefined ? {} : { spreadElementIndex: binding.spreadElementIndex }),
    targetParameterIndex,
    targetForm: parameter.paramsArray === true
      ? binding.sourceForm === "spread-sequence" ? "params-sequence" : "params-element"
      : "parameter",
  };
}
