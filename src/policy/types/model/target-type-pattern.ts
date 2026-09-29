import type {
  TargetTypeParameter,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  targetTypeRefEquals,
} from "../../../target-model/types/equality.js";
import {
  isCsharpNullableReferenceTargetType,
} from "../../../target-model/types/nullable.js";

export function resolveCsharpTargetTypePatternArguments(
  pattern: TargetTypeRef,
  actual: TargetTypeRef,
  parameters: readonly TargetTypeParameter[],
): readonly TargetTypeRef[] | undefined {
  const parameterIdentities = new Set<string>();
  for (const parameter of parameters) {
    if (parameter.identity.length === 0 || parameterIdentities.has(parameter.identity)) {
      return undefined;
    }
    parameterIdentities.add(parameter.identity);
  }
  const bindings = new Map<string, TargetTypeRef>();
  if (!matchTargetTypePattern(pattern, actual, parameterIdentities, bindings)) {
    return undefined;
  }
  const arguments_ = parameters.map((parameter) => bindings.get(parameter.identity));
  return arguments_.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? Object.freeze(arguments_)
    : undefined;
}

function matchTargetTypePattern(
  pattern: TargetTypeRef,
  actual: TargetTypeRef,
  parameterIdentities: ReadonlySet<string>,
  bindings: Map<string, TargetTypeRef>,
): boolean {
  if (pattern.kind === "type-parameter" && parameterIdentities.has(pattern.identity)) {
    if (
      isCsharpNullableReferenceTargetType(pattern) &&
      !isCsharpNullableReferenceTargetType(actual)
    ) {
      return false;
    }
    const existing = bindings.get(pattern.identity);
    if (existing === undefined) {
      bindings.set(pattern.identity, actual);
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
          parameterIdentities,
          bindings,
        );
    case "target-named":
      return actual.kind === "target-named" &&
        pattern.id === actual.id &&
        matchTargetTypePatternList(
          pattern.typeArguments ?? [],
          actual.typeArguments ?? [],
          parameterIdentities,
          bindings,
        );
    case "type-parameter":
      return actual.kind === "type-parameter" && pattern.identity === actual.identity;
    case "array":
      return actual.kind === "array" &&
        (pattern.rank ?? 1) === (actual.rank ?? 1) &&
        matchTargetTypePattern(
          pattern.element,
          actual.element,
          parameterIdentities,
          bindings,
        );
    case "tuple":
      return actual.kind === "tuple" &&
        matchTargetTypePatternList(
          pattern.elements,
          actual.elements,
          parameterIdentities,
          bindings,
        );
    case "pointer":
      return actual.kind === "pointer" &&
        pattern.mutability === actual.mutability &&
        matchTargetTypePattern(
          pattern.pointee,
          actual.pointee,
          parameterIdentities,
          bindings,
        );
    case "function-pointer":
      return actual.kind === "function-pointer" &&
        stringListEquals(pattern.abi ?? [], actual.abi ?? []) &&
        matchTargetTypePatternList(
          pattern.args,
          actual.args,
          parameterIdentities,
          bindings,
        ) &&
        matchTargetTypePattern(
          pattern.result,
          actual.result,
          parameterIdentities,
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
          parameterIdentities,
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
  parameterIdentities: ReadonlySet<string>,
  bindings: Map<string, TargetTypeRef>,
): boolean {
  return patterns.length === actuals.length &&
    patterns.every((pattern, index) =>
      matchTargetTypePattern(
        pattern,
        actuals[index]!,
        parameterIdentities,
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
