import type {
  TargetParameter,
} from "@tsonic/tsts";
import {
  targetParameterPassingModeIsValid,
} from "./argument-passing.js";

export function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  if (!targetParameterListShapeIsValid(parameters)) {
    return false;
  }
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required &&
    (hasParamsArray || argumentCount <= parameters.length) &&
    omittedTargetArgumentsAreRenderable(parameters, argumentCount);
}

export function targetMemberArityPenalty(parameters: readonly TargetParameter[], argumentCount: number): number {
  let penalty = 0;
  const paramsArrayIndex = parameters.findIndex((parameter) => parameter.paramsArray === true);
  if (paramsArrayIndex >= 0 && argumentCount >= paramsArrayIndex) {
    penalty += 2;
  }
  for (let index = argumentCount; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter?.optional === true) {
      penalty += 1;
    }
    if (parameter?.paramsArray === true) {
      penalty += 2;
    }
  }
  return penalty;
}

export function getParameterForArgument(parameters: readonly TargetParameter[], index: number): TargetParameter | undefined {
  const parameter = parameters[index];
  if (parameter !== undefined) {
    return parameter;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function targetParameterListShapeIsValid(parameters: readonly TargetParameter[]): boolean {
  let optionalTailStarted = false;
  let paramsArrayIndex: number | undefined;
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter === undefined) {
      return false;
    }
    if (!targetParameterPassingModeIsValid(parameter.passingMode)) {
      return false;
    }
    if (parameter.optional === true && parameter.paramsArray === true) {
      return false;
    }
    if (parameter.paramsArray === true) {
      if (parameter.passingMode !== "by-value" || parameter.type.kind !== "array" || paramsArrayIndex !== undefined || index !== parameters.length - 1) {
        return false;
      }
      paramsArrayIndex = index;
      continue;
    }
    if (parameter.optional === true) {
      optionalTailStarted = true;
      continue;
    }
    if (optionalTailStarted) {
      return false;
    }
  }
  return true;
}

function omittedTargetArgumentsAreRenderable(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  for (let index = argumentCount; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter === undefined) {
      return false;
    }
    if (parameter.paramsArray === true) {
      continue;
    }
    if (parameter.optional === true && hasSupportedTargetDefaultValue(parameter)) {
      continue;
    }
    return false;
  }
  return true;
}

function hasSupportedTargetDefaultValue(parameter: TargetParameter): boolean {
  return parameter.unsupportedDefaultValue === undefined &&
    (parameter.defaultValue !== undefined || targetParameterIsOmittableWithoutDefault(parameter));
}

function targetParameterIsOmittableWithoutDefault(parameter: TargetParameter): boolean {
  return (parameter as TargetParameter & { readonly csharpOmittableOptionalArgument?: true }).csharpOmittableOptionalArgument === true;
}
