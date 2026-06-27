import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isLiteralRepresentableAsTargetType,
} from "../target-member-literals.js";
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
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  if (actual !== undefined) {
    const actualScore = targetTypeMatchScore(effectiveExpected, actual, typeParameterBindings, options);
    if (actualScore !== undefined) {
      return actualScore;
    }
  }
  if (isLiteralRepresentableAsTargetType(effectiveExpected, subject, context)) {
    return 1;
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
  if (actual !== undefined && !inferSelectedTargetTypeParameters(expected, actual, typeParameterBindings)) {
    return false;
  }
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  if (isLiteralRepresentableAsTargetType(effectiveExpected, subject, context)) {
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
