import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  bindTargetTypeParameter,
  substituteTargetTypeRef,
} from "../type-substitution.js";

export function inferSelectedTargetTypeParameters(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
): boolean {
  if (expected.kind === "type-parameter") {
    return bindTargetTypeParameter(expected.name, actual, typeParameterBindings);
  }
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  if (effectiveExpected.kind === "type-parameter") {
    return bindTargetTypeParameter(effectiveExpected.name, actual, typeParameterBindings);
  }
  if (effectiveExpected.kind === "array" && actual.kind === "array" && (effectiveExpected.rank ?? 1) === (actual.rank ?? 1)) {
    return inferSelectedTargetTypeParameters(effectiveExpected.element, actual.element, typeParameterBindings);
  }
  if (effectiveExpected.kind === "tuple" && actual.kind === "tuple" && effectiveExpected.elements.length === actual.elements.length) {
    return effectiveExpected.elements.every((element, index) => {
      const actualElement = actual.elements[index];
      return actualElement !== undefined && inferSelectedTargetTypeParameters(element, actualElement, typeParameterBindings);
    });
  }
  if (effectiveExpected.kind === "pointer" && actual.kind === "pointer") {
    return inferSelectedTargetTypeParameters(effectiveExpected.pointee, actual.pointee, typeParameterBindings);
  }
  if (effectiveExpected.kind === "function-pointer" && actual.kind === "function-pointer" && effectiveExpected.args.length === actual.args.length) {
    return inferSelectedTargetTypeParameters(effectiveExpected.result, actual.result, typeParameterBindings) &&
      effectiveExpected.args.every((argument, index) => {
        const actualArgument = actual.args[index];
        return actualArgument !== undefined && inferSelectedTargetTypeParameters(argument, actualArgument, typeParameterBindings);
      });
  }
  if (effectiveExpected.kind === "target-named" && actual.kind === "target-named" && effectiveExpected.id === actual.id) {
    const expectedArgs = effectiveExpected.typeArguments ?? [];
    const actualArgs = actual.typeArguments ?? [];
    if (expectedArgs.length !== actualArgs.length) {
      return true;
    }
    return expectedArgs.every((argument, index) => {
      const actualArgument = actualArgs[index];
      return actualArgument !== undefined && inferSelectedTargetTypeParameters(argument, actualArgument, typeParameterBindings);
    });
  }
  return true;
}
