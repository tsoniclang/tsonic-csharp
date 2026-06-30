import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  type CsharpTargetNamedTypeRef,
  getCsharpArrayLiteralElementTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  isCsharpReadOnlyIndexableCollectionTargetType,
  isCsharpVoidTargetType,
} from "../../target-types.js";
import type {
  CsharpDelegateSignatureShape,
} from "../../target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../target-ref-utils.js";
import {
  bindTargetTypeParameter,
} from "../type-substitution.js";
import {
  sourcePrimitiveImplicitlyConverts,
} from "../source-primitive-conversions.js";
import type {
  TargetMemberSelectionOptions,
} from "../types.js";

export function targetTypeMatchScore(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
  seenActualTypes: ReadonlySet<string> = new Set(),
): number | undefined {
  if (expected.kind === "type-parameter") {
    return bindTargetTypeParameter(expected.name, actual, typeParameterBindings) ? 0 : undefined;
  }
  if (targetTypeRefEquals(expected, actual)) {
    return 0;
  }
  if (sourcePrimitiveImplicitlyConverts(expected, actual)) {
    return 3;
  }
  const expectedNullableElement = getCsharpNullableElementTargetType(expected);
  if (expectedNullableElement !== undefined) {
    const nullableScore = targetTypeMatchScore(expectedNullableElement, actual, typeParameterBindings, options, seenActualTypes);
    if (nullableScore !== undefined) {
      return nullableScore + 1;
    }
  }
  const expectedDelegate = getCsharpDelegateSignature(expected);
  if (expectedDelegate !== undefined) {
    return targetDelegateSignatureMatchesExpected(expectedDelegate, actual, typeParameterBindings, options, seenActualTypes) ? 0 : undefined;
  }
  if (expected.kind === "array" && actual.kind === "array" && (expected.rank ?? 1) === (actual.rank ?? 1)) {
    return targetTypeMatchScore(expected.element, actual.element, typeParameterBindings, options, seenActualTypes);
  }
  const expectedCollectionElement = getCsharpCollectionElementTargetType(expected);
  const actualCollectionElement = getCsharpCollectionElementTargetType(actual) ??
    getCsharpArrayLiteralElementTargetType(actual);
  if (
    expectedCollectionElement !== undefined &&
    actualCollectionElement !== undefined &&
    collectionShapeAcceptsActual(expected, actual)
  ) {
    const elementScore = targetTypeMatchScore(expectedCollectionElement, actualCollectionElement, typeParameterBindings, options, seenActualTypes);
    if (elementScore !== undefined) {
      return elementScore + 2;
    }
  }
  const expectedArrayLiteralElement = getCsharpArrayLiteralElementTargetType(expected);
  if (expectedArrayLiteralElement !== undefined && actual.kind === "array") {
    const elementScore = targetTypeMatchScore(expectedArrayLiteralElement, actual.element, typeParameterBindings, options, seenActualTypes);
    return elementScore === undefined ? undefined : elementScore + 2;
  }
  if (expected.kind === "tuple" && actual.kind === "tuple" && expected.elements.length === actual.elements.length) {
    let tupleScore = 0;
    for (let index = 0; index < expected.elements.length; index += 1) {
      const element = expected.elements[index];
      const actualElement = actual.elements[index];
      const elementScore = element === undefined || actualElement === undefined
        ? undefined
        : targetTypeMatchScore(element, actualElement, typeParameterBindings, options, seenActualTypes);
      if (elementScore === undefined) {
        return undefined;
      }
      tupleScore += elementScore;
    }
    return tupleScore;
  }
  if (expected.kind === "target-named" && actual.kind === "target-named" && expected.id === actual.id) {
    const expectedArgs = expected.typeArguments ?? [];
    const actualArgs = actual.typeArguments ?? [];
    if (expectedArgs.length !== actualArgs.length) {
      return undefined;
    }
    let argumentScore = 0;
    for (let index = 0; index < expectedArgs.length; index += 1) {
      const argument = expectedArgs[index];
      const actualArgument = actualArgs[index];
      const matchScore = argument === undefined || actualArgument === undefined
        ? undefined
        : targetTypeMatchScore(argument, actualArgument, typeParameterBindings, options, seenActualTypes);
      if (matchScore === undefined) {
        return undefined;
      }
      argumentScore += matchScore;
    }
    return argumentScore;
  }
  if (expected.kind === "target-named" && actual.kind === "target-named") {
    const actualKey = targetTypeRefKey(actual);
    if (!seenActualTypes.has(actualKey)) {
      const baseType = options.getBaseTargetTypeRef?.(actual);
      if (baseType !== undefined) {
        const baseScore = targetTypeMatchScore(expected, baseType, typeParameterBindings, options, new Set([...seenActualTypes, actualKey]));
        return baseScore === undefined ? undefined : baseScore + 2;
      }
    }
  }
  if (expected.kind === "pointer" && actual.kind === "pointer") {
    return targetTypeMatchScore(expected.pointee, actual.pointee, typeParameterBindings, options, seenActualTypes);
  }
  if (expected.kind === "function-pointer" && actual.kind === "function-pointer" && expected.args.length === actual.args.length) {
    const resultScore = targetTypeMatchScore(expected.result, actual.result, typeParameterBindings, options, seenActualTypes);
    if (resultScore === undefined) {
      return undefined;
    }
    let argumentScore = 0;
    for (let index = 0; index < expected.args.length; index += 1) {
      const argument = expected.args[index];
      const actualArgument = actual.args[index];
      const matchScore = argument === undefined || actualArgument === undefined
        ? undefined
        : targetTypeMatchScore(argument, actualArgument, typeParameterBindings, options, seenActualTypes);
      if (matchScore === undefined) {
        return undefined;
      }
      argumentScore += matchScore;
    }
    return resultScore + argumentScore;
  }
  return undefined;
}

function collectionShapeAcceptsActual(expected: TargetTypeRef, actual: TargetTypeRef): boolean {
  if (actual.kind === "array") {
    return getCsharpArrayLiteralElementTargetType(expected) !== undefined;
  }
  if (isCsharpReadOnlyIndexableCollectionTargetType(expected)) {
    return isCsharpReadOnlyIndexableCollectionTargetType(actual);
  }
  if (isCsharpDenseMutableCollectionTargetType(expected)) {
    return isCsharpDenseMutableCollectionTargetType(actual);
  }
  if (getCsharpCollectionElementTargetType(expected) !== undefined) {
    return getCsharpCollectionElementTargetType(actual) !== undefined ||
      getCsharpArrayLiteralElementTargetType(actual) !== undefined;
  }
  return false;
}

function getCsharpDelegateSignature(type: TargetTypeRef): CsharpDelegateSignatureShape | undefined {
  return type.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef & { readonly csharpDelegateSignature?: CsharpDelegateSignatureShape }).csharpDelegateSignature
    : undefined;
}

function targetDelegateSignatureMatchesExpected(
  expected: CsharpDelegateSignatureShape,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
  seenActualTypes: ReadonlySet<string>,
): boolean {
  const actualSignature = actual.kind === "function-pointer"
    ? {
        parameters: actual.args,
        returnType: actual.result,
      }
    : getCsharpDelegateSignature(actual);
  if (actualSignature === undefined || expected.parameters.length !== actualSignature.parameters.length) {
    return false;
  }
  if (!expected.parameters.every((parameter, index) => {
    const actualParameter = actualSignature.parameters[index];
    return actualParameter !== undefined && targetTypeMatchScore(parameter, actualParameter, typeParameterBindings, options, seenActualTypes) !== undefined;
  })) {
    return false;
  }
  if (expected.returnType === undefined || actualSignature.returnType === undefined) {
    return false;
  }
  if (isCsharpVoidTargetType(expected.returnType)) {
    return isCsharpVoidTargetType(actualSignature.returnType);
  }
  return targetTypeMatchScore(expected.returnType, actualSignature.returnType, typeParameterBindings, options, seenActualTypes) !== undefined;
}
