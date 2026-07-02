import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetParameter,
} from "../target-types.js";
import {
  getParameterForArgument,
  targetArityMatches,
} from "./arity.js";

export function getTargetArgumentConversionTypes(
  parameters: readonly CsharpTargetParameter[],
  argumentCount: number,
): readonly TargetTypeRef[] | undefined {
  if (!targetArityMatches(parameters, argumentCount)) {
    return undefined;
  }
  const conversions: TargetTypeRef[] = [];
  for (let index = 0; index < argumentCount; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    if (parameter === undefined) {
      return undefined;
    }
    conversions.push(getTargetArgumentConversionType(parameter));
  }
  return conversions;
}

function getTargetArgumentConversionType(parameter: CsharpTargetParameter): TargetTypeRef {
  return parameter.paramsArray === true && parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}
