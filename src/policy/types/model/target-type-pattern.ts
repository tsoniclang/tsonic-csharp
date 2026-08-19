import type {
  TargetTypeParameter,
  TargetTypeRef,
} from "./definitions.js";
import {
  targetTypeRefEquals,
} from "./equality.js";
import {
  isCsharpNullableReferenceTargetType,
} from "../storage/nullable.js";

export function resolveCsharpTargetTypePatternArguments(
  pattern: TargetTypeRef,
  actual: TargetTypeRef,
  parameters: readonly TargetTypeParameter[],
): readonly TargetTypeRef[] | undefined {
  const parameterNames = new Set<string>();
  for (const parameter of parameters) {
    if (parameter.name.length === 0 || parameterNames.has(parameter.name)) {
      return undefined;
    }
    parameterNames.add(parameter.name);
  }
  const bindings = new Map<string, TargetTypeRef>();
  if (!matchTargetTypePattern(pattern, actual, parameterNames, bindings)) {
    return undefined;
  }
  const arguments_ = parameters.map((parameter) => bindings.get(parameter.name));
  return arguments_.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? Object.freeze(arguments_)
    : undefined;
}

function matchTargetTypePattern(
  pattern: TargetTypeRef,
  actual: TargetTypeRef,
  parameterNames: ReadonlySet<string>,
  bindings: Map<string, TargetTypeRef>,
): boolean {
  if (pattern.kind === "type-parameter" && parameterNames.has(pattern.name)) {
    if (
      isCsharpNullableReferenceTargetType(pattern) &&
      !isCsharpNullableReferenceTargetType(actual)
    ) {
      return false;
    }
    const existing = bindings.get(pattern.name);
    if (existing === undefined) {
      bindings.set(pattern.name, actual);
      return true;
    }
    return targetTypeRefEquals(existing, actual);
  }
  if (
    isCsharpNullableReferenceTargetType(pattern) !==
      isCsharpNullableReferenceTargetType(actual)
  ) {
    return false;
  }
  if (pattern.kind !== actual.kind) {
    return false;
  }
  switch (pattern.kind) {
    case "source-primitive":
      return actual.kind === "source-primitive" && pattern.name === actual.name;
    case "source-global":
      return actual.kind === "source-global" &&
        pattern.name === actual.name &&
        matchTargetTypePatternList(
          pattern.typeArguments ?? [],
          actual.typeArguments ?? [],
          parameterNames,
          bindings,
        );
    case "target-named":
      return actual.kind === "target-named" &&
        pattern.id === actual.id &&
        matchTargetTypePatternList(
          pattern.typeArguments ?? [],
          actual.typeArguments ?? [],
          parameterNames,
          bindings,
        );
    case "type-parameter":
      return actual.kind === "type-parameter" && pattern.name === actual.name;
    case "array":
      return actual.kind === "array" &&
        (pattern.rank ?? 1) === (actual.rank ?? 1) &&
        matchTargetTypePattern(
          pattern.element,
          actual.element,
          parameterNames,
          bindings,
        );
    case "tuple":
      return actual.kind === "tuple" &&
        matchTargetTypePatternList(
          pattern.elements,
          actual.elements,
          parameterNames,
          bindings,
        );
    case "pointer":
      return actual.kind === "pointer" &&
        pattern.mutability === actual.mutability &&
        matchTargetTypePattern(
          pattern.pointee,
          actual.pointee,
          parameterNames,
          bindings,
        );
    case "function-pointer":
      return actual.kind === "function-pointer" &&
        stringListEquals(pattern.abi ?? [], actual.abi ?? []) &&
        matchTargetTypePatternList(
          pattern.args,
          actual.args,
          parameterNames,
          bindings,
        ) &&
        matchTargetTypePattern(
          pattern.result,
          actual.result,
          parameterNames,
          bindings,
        );
    case "opaque":
      return actual.kind === "opaque" && pattern.id === actual.id;
    case "associated-type":
      return actual.kind === "associated-type" &&
        pattern.name === actual.name &&
        matchTargetTypePattern(
          pattern.owner,
          actual.owner,
          parameterNames,
          bindings,
        );
    case "lifetime":
      return actual.kind === "lifetime" && pattern.name === actual.name;
    case "target-specific":
      return actual.kind === "target-specific" &&
        pattern.target === actual.target &&
        pattern.name === actual.name &&
        pattern.payloadId === actual.payloadId;
  }
}

function matchTargetTypePatternList(
  patterns: readonly TargetTypeRef[],
  actuals: readonly TargetTypeRef[],
  parameterNames: ReadonlySet<string>,
  bindings: Map<string, TargetTypeRef>,
): boolean {
  return patterns.length === actuals.length &&
    patterns.every((pattern, index) =>
      matchTargetTypePattern(
        pattern,
        actuals[index]!,
        parameterNames,
        bindings,
      ));
}

function stringListEquals(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}
