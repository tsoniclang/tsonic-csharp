import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
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
  isLiteralRepresentableAsTargetType,
} from "../target-member-literals.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
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
  const contextualFunctionScore = sourceFunctionArgumentMatchScore(
    effectiveExpected,
    actual,
    subject,
    context,
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
  if (sourceFunctionArgumentMatchScore(
    effectiveExpected,
    actual,
    subject,
    context,
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
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): number | undefined {
  const expectedDelegate = getCsharpDelegateSignature(expected);
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (expectedDelegate === undefined || node === undefined || ast === undefined || !isSourceFunctionExpression(ast, node)) {
    return undefined;
  }
  const parameters = getNodeList(getNodeField(node, "Parameters"));
  const parameterCount = parameters.length === 0
    ? getNodeList(getNodeField(node, "parameters")).length
    : parameters.length;
  if (parameterCount !== expectedDelegate.parameters.length) {
    return undefined;
  }
  if (expectedDelegate.returnType === undefined || isCsharpVoidTargetType(expectedDelegate.returnType)) {
    return 4;
  }
  const actualReturnType = getCsharpDelegateSignature(actual)?.returnType;
  const returnScore = actualReturnType === undefined
    ? undefined
    : targetTypeMatchScore(expectedDelegate.returnType, actualReturnType, typeParameterBindings, options);
  return returnScore === undefined ? undefined : returnScore + 4;
}

function isSourceFunctionExpression(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node);
}

function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef & { readonly csharpDelegateSignature?: CsharpDelegateSignatureShape }).csharpDelegateSignature
    : undefined;
}
