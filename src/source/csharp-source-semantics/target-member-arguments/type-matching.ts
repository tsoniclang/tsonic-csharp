import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpDelegateSignatureShape,
  CsharpTargetNamedTypeRef,
} from "../target-types.js";
import {
  isCsharpVoidTargetType,
} from "../target-types.js";
import {
  sourcePrimitiveImplicitlyConverts,
} from "./source-primitive-conversions.js";
import {
  substituteTargetTypeRef,
} from "./type-substitution.js";
import type {
  TargetMemberSelectionOptions,
} from "./types.js";
import {
  selectedCollectionImplicitlyConverts,
} from "./type-matching/collection-conversions.js";
import {
  inferSelectedTargetTypeParameters,
} from "./type-matching/type-parameter-inference.js";
import {
  targetTypeMatchScore,
} from "./type-matching/target-type-score.js";

export function targetTypeArgumentMatchScore(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): number | undefined {
  void subject;
  void context;
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  const contextualFunctionScore = sourceFunctionArgumentMatchScore(
    effectiveExpected,
    actual,
    typeParameterBindings,
    options,
  );
  if (contextualFunctionScore !== undefined) {
    return contextualFunctionScore;
  }
  if (actual !== undefined) {
    const actualScore = targetTypeMatchScore(effectiveExpected, actual, typeParameterBindings, options);
    if (actualScore !== undefined) {
      return actualScore;
    }
  }
  return undefined;
}

export function targetTypeMatchesExpected(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
  seenActualTypes: ReadonlySet<string> = new Set(),
): boolean {
  return targetTypeMatchScore(expected, actual, typeParameterBindings, options, seenActualTypes) !== undefined;
}

export function selectedTargetTypeAcceptsArgument(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): boolean {
  void subject;
  if (actual !== undefined && !inferSelectedTargetTypeParameters(expected, actual, typeParameterBindings)) {
    return false;
  }
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  if (sourceFunctionArgumentMatchScore(
    effectiveExpected,
    actual,
    typeParameterBindings,
    options,
  ) !== undefined) {
    return true;
  }
  if (actual === undefined) {
    return false;
  }
  return targetTypeMatchesExpected(effectiveExpected, actual, typeParameterBindings, options) ||
    selectedCollectionImplicitlyConverts(effectiveExpected, actual, (expectedElement, actualElement) =>
      selectedTargetTypeAcceptsArgument(expectedElement, actualElement, undefined, context, typeParameterBindings, options)
    ) ||
    sourcePrimitiveImplicitlyConverts(effectiveExpected, actual);
}

function sourceFunctionArgumentMatchScore(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): number | undefined {
  const expectedDelegate = getCsharpDelegateSignature(expected);
  const actualDelegate = getCsharpDelegateSignature(actual);
  if (expectedDelegate === undefined || actualDelegate === undefined) {
    return undefined;
  }
  if (actualDelegate.parameters.length !== expectedDelegate.parameters.length) {
    return undefined;
  }
  if (expectedDelegate.returnType === undefined) {
    return undefined;
  }
  if (isCsharpVoidTargetType(expectedDelegate.returnType)) {
    return 4;
  }
  const actualReturnType = actualDelegate.returnType;
  const returnScore = actualReturnType === undefined
    ? undefined
    : targetTypeMatchScore(expectedDelegate.returnType, actualReturnType, typeParameterBindings, options);
  return returnScore === undefined ? undefined : returnScore + 4;
}

function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef & { readonly csharpDelegateSignature?: CsharpDelegateSignatureShape }).csharpDelegateSignature
    : undefined;
}
