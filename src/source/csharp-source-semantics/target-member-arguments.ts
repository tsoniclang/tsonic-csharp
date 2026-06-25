import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
import {
  type CsharpTargetNamedTypeRef,
  getCsharpCollectionElementTargetType,
  getCsharpArrayLiteralElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "./target-types.js";
import type {
  CsharpDelegateSignatureShape,
} from "./target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly ExtensionFactSubject[];
  readonly receiver?: ExtensionFactSubject;
}

export interface TargetMemberSelectionOptions {
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly declaringTargetType?: TargetTypeRef;
  readonly declaringTypeParameters?: readonly TargetTypeParameter[];
  readonly firstArgumentReceiver?: ExtensionFactSubject | false;
}

export function selectTargetMember(
  candidates: readonly TargetMember[],
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): TargetMember | undefined {
  const matching = candidates.flatMap((member) => {
    const match = targetMemberMatch(member, request, context, resolveTargetTypeRef, options);
    return match === undefined ? [] : [match];
  });
  const bestScore = Math.min(...matching.map((match) => match.score));
  const best = matching.filter((match) => match.score === bestScore);
  return best.length === 1 ? best[0]?.member : undefined;
}

export function selectExactTargetMember(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
  options: TargetMemberSelectionOptions = {},
): TargetMember | undefined {
  const arguments_ = getTargetArgumentSubjectsForMember(member, request, options);
  if (arguments_ === undefined || !targetArityMatches(member.parameters, arguments_.length)) {
    return undefined;
  }
  return substituteTargetMemberTypeParameters(
    member,
    getDeclaringTypeParameterBindings(options),
  );
}

function targetMemberMatch(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions,
): { readonly member: TargetMember; readonly score: number } | undefined {
  const arguments_ = getTargetArgumentSubjectsForMember(member, request, options);
  if (arguments_ === undefined) {
    return undefined;
  }
  const parameters = member.parameters;
  if (!targetArityMatches(parameters, arguments_.length)) {
    return undefined;
  }
  const typeParameterBindings = getDeclaringTypeParameterBindings(options);
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const argumentType = resolveTargetTypeRef(argument, context);
    if (!targetTypeAcceptsArgument(getExpectedTargetTypeForArgument(parameter), argumentType, argument, context, typeParameterBindings, options)) {
      return undefined;
    }
  }
  return {
    member: substituteTargetMemberTypeParameters(member, typeParameterBindings),
    score: targetMemberArityPenalty(parameters, arguments_.length),
  };
}

function getTargetArgumentSubjectsForMember(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
  options: TargetMemberSelectionOptions = {},
): readonly ExtensionFactSubject[] | undefined {
  if (member.receiverPassing !== "first-argument") {
    return request.arguments;
  }
  if (options.firstArgumentReceiver === false) {
    return request.arguments;
  }
  const receiver = options.firstArgumentReceiver ?? request.receiver;
  return receiver === undefined
    ? undefined
    : [receiver, ...request.arguments];
}

function getExpectedTargetTypeForArgument(parameter: TargetParameter): TargetTypeRef {
  return parameter.paramsArray === true && parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}

function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  if (!targetParameterListShapeIsValid(parameters)) {
    return false;
  }
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required && (hasParamsArray || argumentCount <= parameters.length);
}

function targetParameterListShapeIsValid(parameters: readonly TargetParameter[]): boolean {
  let optionalTailStarted = false;
  let paramsArrayIndex: number | undefined;
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter === undefined) {
      return false;
    }
    if (parameter.optional === true && parameter.paramsArray === true) {
      return false;
    }
    if (parameter.paramsArray === true) {
      if (paramsArrayIndex !== undefined || index !== parameters.length - 1) {
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

function targetMemberArityPenalty(parameters: readonly TargetParameter[], argumentCount: number): number {
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

function getParameterForArgument(parameters: readonly TargetParameter[], index: number): TargetParameter | undefined {
  const parameter = parameters[index];
  if (parameter !== undefined) {
    return parameter;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function targetTypeAcceptsArgument(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): boolean {
  const effectiveExpected = substituteTargetTypeRef(expected, typeParameterBindings);
  if (actual !== undefined && targetTypeMatchesExpected(effectiveExpected, actual, typeParameterBindings, options)) {
    return true;
  }
  if (isLiteralRepresentableAsTargetType(effectiveExpected, subject, context)) {
    return true;
  }
  if (actual === undefined) {
    return false;
  }
  return false;
}

function targetTypeMatchesExpected(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
  seenActualTypes: ReadonlySet<string> = new Set(),
): boolean {
  if (expected.kind === "type-parameter") {
    return bindTargetTypeParameter(expected.name, actual, typeParameterBindings);
  }
  if (targetTypeRefEquals(expected, actual)) {
    return true;
  }
  const expectedNullableElement = getCsharpNullableElementTargetType(expected);
  if (expectedNullableElement !== undefined && targetTypeMatchesExpected(expectedNullableElement, actual, typeParameterBindings, options, seenActualTypes)) {
    return true;
  }
  const expectedDelegate = getCsharpDelegateSignature(expected);
  if (expectedDelegate !== undefined) {
    return targetDelegateSignatureMatchesExpected(expectedDelegate, actual, typeParameterBindings, options, seenActualTypes);
  }
  if (expected.kind === "array" && actual.kind === "array" && (expected.rank ?? 1) === (actual.rank ?? 1)) {
    return targetTypeMatchesExpected(expected.element, actual.element, typeParameterBindings, options, seenActualTypes);
  }
  const expectedCollectionElement = getCsharpCollectionElementTargetType(expected);
  const actualCollectionElement = getCsharpCollectionElementTargetType(actual) ??
    getCsharpArrayLiteralElementTargetType(actual);
  if (
    expectedCollectionElement !== undefined &&
    actualCollectionElement !== undefined &&
    collectionShapeAcceptsActual(expected, actual) &&
    targetTypeMatchesExpected(expectedCollectionElement, actualCollectionElement, typeParameterBindings, options, seenActualTypes)
  ) {
    return true;
  }
  const expectedArrayLiteralElement = getCsharpArrayLiteralElementTargetType(expected);
  if (expectedArrayLiteralElement !== undefined && actual.kind === "array") {
    return targetTypeMatchesExpected(expectedArrayLiteralElement, actual.element, typeParameterBindings, options, seenActualTypes);
  }
  if (expected.kind === "tuple" && actual.kind === "tuple" && expected.elements.length === actual.elements.length) {
    return expected.elements.every((element, index) => {
      const actualElement = actual.elements[index];
      return actualElement !== undefined && targetTypeMatchesExpected(element, actualElement, typeParameterBindings, options, seenActualTypes);
    });
  }
  if (expected.kind === "target-named" && actual.kind === "target-named" && expected.id === actual.id) {
    const expectedArgs = expected.typeArguments ?? [];
    const actualArgs = actual.typeArguments ?? [];
    if (expectedArgs.length !== actualArgs.length) {
      return false;
    }
    return expectedArgs.every((argument, index) => {
      const actualArgument = actualArgs[index];
      return actualArgument !== undefined && targetTypeMatchesExpected(argument, actualArgument, typeParameterBindings, options, seenActualTypes);
    });
  }
  if (expected.kind === "target-named" && actual.kind === "target-named") {
    const actualKey = targetTypeRefKey(actual);
    if (!seenActualTypes.has(actualKey)) {
      const baseType = options.getBaseTargetTypeRef?.(actual);
      if (baseType !== undefined) {
        return targetTypeMatchesExpected(expected, baseType, typeParameterBindings, options, new Set([...seenActualTypes, actualKey]));
      }
    }
  }
  if (expected.kind === "pointer" && actual.kind === "pointer") {
    return targetTypeMatchesExpected(expected.pointee, actual.pointee, typeParameterBindings, options, seenActualTypes);
  }
  if (expected.kind === "function-pointer" && actual.kind === "function-pointer" && expected.args.length === actual.args.length) {
    return targetTypeMatchesExpected(expected.result, actual.result, typeParameterBindings, options, seenActualTypes) &&
      expected.args.every((argument, index) => {
        const actualArgument = actual.args[index];
        return actualArgument !== undefined && targetTypeMatchesExpected(argument, actualArgument, typeParameterBindings, options, seenActualTypes);
      });
  }
  return false;
}

function collectionShapeAcceptsActual(expected: TargetTypeRef, actual: TargetTypeRef): boolean {
  if (actual.kind === "array") {
    return getCsharpArrayLiteralElementTargetType(expected) !== undefined;
  }
  if (expected.kind === "target-named" && expected.id === "System.Collections.Generic.IEnumerable`1") {
    return getCsharpCollectionElementTargetType(actual) !== undefined ||
      getCsharpArrayLiteralElementTargetType(actual) !== undefined;
  }
  if (isCsharpReadOnlyIndexableCollectionTargetType(expected)) {
    return isCsharpReadOnlyIndexableCollectionTargetType(actual);
  }
  if (isCsharpDenseMutableCollectionTargetType(expected)) {
    return isCsharpDenseMutableCollectionTargetType(actual);
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
    return actualParameter !== undefined && targetTypeMatchesExpected(parameter, actualParameter, typeParameterBindings, options, seenActualTypes);
  })) {
    return false;
  }
  if (expected.returnType === undefined) {
    return true;
  }
  return actualSignature.returnType !== undefined &&
    targetTypeMatchesExpected(expected.returnType, actualSignature.returnType, typeParameterBindings, options, seenActualTypes);
}

function getDeclaringTypeParameterBindings(
  options: TargetMemberSelectionOptions,
): Map<string, TargetTypeRef> {
  const bindings = new Map<string, TargetTypeRef>();
  const targetType = options.declaringTargetType;
  const typeParameters = options.declaringTypeParameters ?? [];
  if (targetType?.kind !== "target-named" || typeParameters.length === 0) {
    return bindings;
  }
  const typeArguments = targetType.typeArguments ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      bindings.set(parameter.name, argument);
    }
  }
  return bindings;
}

function bindTargetTypeParameter(
  name: string,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
): boolean {
  const existing = typeParameterBindings.get(name);
  if (existing === undefined) {
    typeParameterBindings.set(name, actual);
    return true;
  }
  return targetTypeRefEquals(existing, actual);
}

function substituteTargetMemberTypeParameters(
  member: TargetMember,
  typeParameterBindings: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
  if (typeParameterBindings.size === 0) {
    return member;
  }
  return {
    ...member,
    ...(member.declaringType !== undefined ? { declaringType: substituteTargetTypeRef(member.declaringType, typeParameterBindings) } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeParameterBindings),
    })),
    ...(member.returnType !== undefined ? { returnType: substituteTargetTypeRef(member.returnType, typeParameterBindings) } : {}),
  };
}

function substituteTargetTypeRef(type: TargetTypeRef, typeParameterBindings: ReadonlyMap<string, TargetTypeRef>): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return typeParameterBindings.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeRef(argument, typeParameterBindings)) }
          : {}),
        ...((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeRef((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType!, typeParameterBindings) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeRef(type.element, typeParameterBindings) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeRef(element, typeParameterBindings)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeRef(type.pointee, typeParameterBindings) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeRef(argument, typeParameterBindings)),
        result: substituteTargetTypeRef(type.result, typeParameterBindings),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeRef(type.owner, typeParameterBindings) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}
