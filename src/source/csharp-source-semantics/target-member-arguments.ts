import type {
  ArgumentPassingFact,
  ArgumentPassingMode,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  argumentPassingFactKey,
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

const implicitSourcePrimitiveConversions = new Map<string, ReadonlySet<string>>([
  ["int8", new Set(["int16", "int32", "int64", "float32", "float64", "decimal"])],
  ["uint8", new Set(["int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["int16", new Set(["int32", "int64", "float32", "float64", "decimal"])],
  ["uint16", new Set(["int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["char", new Set(["uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "decimal"])],
  ["int32", new Set(["int64", "float32", "float64", "decimal"])],
  ["uint32", new Set(["int64", "uint64", "float32", "float64", "decimal"])],
  ["int64", new Set(["float32", "float64", "decimal"])],
  ["uint64", new Set(["float32", "float64", "decimal"])],
  ["float32", new Set(["float64"])],
]);
const noImplicitSourcePrimitiveConversions: ReadonlySet<string> = new Set();

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly ExtensionFactSubject[];
  readonly receiver?: ExtensionFactSubject;
  readonly sourceSelectedSignature?: unknown;
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

export function selectProviderSelectedTargetMember(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): TargetMember | undefined {
  const arguments_ = getTargetArgumentSubjectsForMember(member, request, options);
  if (arguments_ === undefined || !targetArityMatches(member.parameters, arguments_.length)) {
    return undefined;
  }
  const typeParameterBindings = getDeclaringTypeParameterBindings(options);
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(member.parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const effectiveArgument = getEffectiveArgumentForTargetParameter(parameter, argument, context);
    if (effectiveArgument === undefined) {
      return undefined;
    }
    const argumentType = resolveTargetTypeRef(effectiveArgument.subject, context);
    if (!selectedTargetTypeAcceptsArgument(
      getExpectedTargetTypeForArgument(parameter),
      argumentType,
      effectiveArgument.subject,
      context,
      typeParameterBindings,
      options,
    )) {
      return undefined;
    }
  }
  return substituteTargetMemberTypeParameters(member, typeParameterBindings);
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
  let argumentScore = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const effectiveArgument = getEffectiveArgumentForTargetParameter(parameter, argument, context);
    if (effectiveArgument === undefined) {
      return undefined;
    }
    const argumentType = resolveTargetTypeRef(effectiveArgument.subject, context);
    if (argumentType === undefined && targetParameterAcceptsCheckedSourceArgument(parameter) && request.sourceSelectedSignature !== undefined) {
      argumentScore += 20;
      continue;
    }
    const matchScore = targetTypeArgumentMatchScore(getExpectedTargetTypeForArgument(parameter), argumentType, effectiveArgument.subject, context, typeParameterBindings, options);
    if (matchScore === undefined) {
      return undefined;
    }
    argumentScore += matchScore;
  }
  return {
    member: substituteTargetMemberTypeParameters(member, typeParameterBindings),
    score: argumentScore + targetMemberArityPenalty(parameters, arguments_.length),
  };
}

function targetParameterAcceptsCheckedSourceArgument(parameter: TargetParameter): boolean {
  return (parameter as TargetParameter & { readonly csharpAcceptsCheckedSourceArgument?: true }).csharpAcceptsCheckedSourceArgument === true;
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

function getEffectiveArgumentForTargetParameter(
  parameter: TargetParameter,
  argument: ExtensionFactSubject,
  context: ExtensionObservationContext,
): { readonly subject: ExtensionFactSubject; readonly passing?: ArgumentPassingFact } | undefined {
  const passing = getArgumentPassingFact(argument, context);
  if (parameter.passingMode === "by-value") {
    return passing === undefined
      ? { subject: argument }
      : undefined;
  }
  if (passing === undefined || !argumentPassingModeMatchesTargetParameter(parameter.passingMode, passing.mode)) {
    return undefined;
  }
  return passing.targetExpression === undefined
    ? undefined
    : {
        subject: passing.targetExpression,
        passing,
      };
}

function getArgumentPassingFact(
  argument: ExtensionFactSubject,
  context: ExtensionObservationContext,
): ArgumentPassingFact | undefined {
  const factContext = context as {
    readonly factResolver?: ExtensionObservationContext["factResolver"];
    readonly facts?: ExtensionObservationContext["facts"];
  };
  return factContext.factResolver?.resolve(argument, argumentPassingFactKey) ??
    factContext.facts?.get(argument, argumentPassingFactKey);
}

function argumentPassingModeMatchesTargetParameter(expected: ArgumentPassingMode, actual: ArgumentPassingMode): boolean {
  return expected === actual;
}

function targetParameterPassingModeIsValid(mode: unknown): mode is ArgumentPassingMode {
  switch (mode) {
    case "by-value":
    case "byref-writeonly-must-init":
    case "byref-readwrite":
    case "byref-readonly":
      return true;
    default:
      return false;
  }
}

function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  if (!targetParameterListShapeIsValid(parameters)) {
    return false;
  }
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required &&
    (hasParamsArray || argumentCount <= parameters.length) &&
    omittedTargetArgumentsAreRenderable(parameters, argumentCount);
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

function getParameterForArgument(parameters: readonly TargetParameter[], index: number): TargetParameter | undefined {
  const parameter = parameters[index];
  if (parameter !== undefined) {
    return parameter;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function targetTypeArgumentMatchScore(
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

function targetTypeMatchesExpected(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
  seenActualTypes: ReadonlySet<string> = new Set(),
): boolean {
  return targetTypeMatchScore(expected, actual, typeParameterBindings, options, seenActualTypes) !== undefined;
}

function targetTypeMatchScore(
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
  if (targetTypeIsObjectCatchAll(expected) && targetTypeIsClosedObjectAssignable(actual)) {
    return 10;
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

function targetTypeIsObjectCatchAll(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Object";
}

function targetTypeIsClosedObjectAssignable(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
    case "target-named":
    case "target-specific":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "associated-type":
      return true;
    case "type-parameter":
    case "opaque":
    case "lifetime":
      return false;
  }
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

function inferSelectedTargetTypeParameters(
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

function selectedTargetTypeAcceptsArgument(
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
    selectedCollectionImplicitlyConverts(effectiveExpected, actual, context, typeParameterBindings, options) ||
    sourcePrimitiveImplicitlyConverts(effectiveExpected, actual);
}

function selectedCollectionImplicitlyConverts(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  context: ExtensionObservationContext,
  typeParameterBindings: Map<string, TargetTypeRef>,
  options: TargetMemberSelectionOptions,
): boolean {
  if (actual.kind !== "array" || expected.kind !== "target-named") {
    return false;
  }
  if (
    expected.id !== "System.Collections.Generic.IEnumerable`1" &&
    expected.id !== "System.Collections.Generic.IReadOnlyList`1" &&
    expected.id !== "System.Collections.Generic.IList`1"
  ) {
    return false;
  }
  const expectedElement = getCsharpCollectionElementTargetType(expected);
  const actualElement = getCsharpCollectionElementTargetType(actual);
  return expectedElement !== undefined &&
    actualElement !== undefined &&
    selectedTargetTypeAcceptsArgument(expectedElement, actualElement, undefined, context, typeParameterBindings, options);
}

function sourcePrimitiveImplicitlyConverts(expected: TargetTypeRef, actual: TargetTypeRef): boolean {
  if (expected.kind !== "source-primitive" || actual.kind !== "source-primitive") {
    return false;
  }
  return getImplicitSourcePrimitiveConversions(actual.name).has(expected.name);
}

function getImplicitSourcePrimitiveConversions(actual: string): ReadonlySet<string> {
  return implicitSourcePrimitiveConversions.get(actual) ?? noImplicitSourcePrimitiveConversions;
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
        ...((type as CsharpTargetNamedTypeRef).csharpEnumerableElementType === undefined
          ? {}
          : { csharpEnumerableElementType: substituteTargetTypeRef((type as CsharpTargetNamedTypeRef).csharpEnumerableElementType!, typeParameterBindings) }),
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
