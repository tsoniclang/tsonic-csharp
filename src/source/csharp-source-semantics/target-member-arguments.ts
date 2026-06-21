import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

export interface TargetMemberSelectionRequest {
  readonly arguments: readonly ExtensionFactSubject[];
  readonly receiver?: ExtensionFactSubject;
}

export function selectTargetMember(
  candidates: readonly TargetMember[],
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): TargetMember | undefined {
  const matching = candidates.filter((member) =>
    targetMemberMatchesArguments(member, request, context, resolveTargetTypeRef));
  return matching.length === 1 ? matching[0] : undefined;
}

function targetMemberMatchesArguments(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): boolean {
  const arguments_ = getTargetArgumentSubjectsForMember(member, request);
  if (arguments_ === undefined) {
    return false;
  }
  const parameters = member.parameters;
  if (!targetArityMatches(parameters, arguments_.length)) {
    return false;
  }
  const typeParameterBindings = new Map<string, TargetTypeRef>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return false;
    }
    const argumentType = resolveTargetTypeRef(argument, context);
    if (!targetTypeAcceptsArgument(getExpectedTargetTypeForArgument(parameter), argumentType, argument, context, typeParameterBindings)) {
      return false;
    }
  }
  return true;
}

function getTargetArgumentSubjectsForMember(
  member: TargetMember,
  request: TargetMemberSelectionRequest,
): readonly ExtensionFactSubject[] | undefined {
  if (member.receiverPassing !== "first-argument") {
    return request.arguments;
  }
  return request.receiver === undefined
    ? undefined
    : [request.receiver, ...request.arguments];
}

function getExpectedTargetTypeForArgument(parameter: TargetParameter): TargetTypeRef {
  return parameter.paramsArray === true && parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}

function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required && (hasParamsArray || argumentCount <= parameters.length);
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
): boolean {
  if (actual !== undefined && targetTypeMatchesExpected(expected, actual, typeParameterBindings)) {
    return true;
  }
  if (isLiteralRepresentableAsTargetType(expected, subject, context)) {
    return true;
  }
  if (actual === undefined) {
    return false;
  }
  if (expected.kind === "opaque" && (expected.id === "any" || expected.id === "unknown")) {
    return true;
  }
  return expected.kind === "target-named" && expected.id === "System.Object";
}

function targetTypeMatchesExpected(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
): boolean {
  if (expected.kind === "type-parameter") {
    return bindTargetTypeParameter(expected.name, actual, typeParameterBindings);
  }
  if (targetTypeRefEquals(expected, actual)) {
    return true;
  }
  if (expected.kind === "array" && actual.kind === "array" && (expected.rank ?? 1) === (actual.rank ?? 1)) {
    return targetTypeMatchesExpected(expected.element, actual.element, typeParameterBindings);
  }
  if (expected.kind === "tuple" && actual.kind === "tuple" && expected.elements.length === actual.elements.length) {
    return expected.elements.every((element, index) => {
      const actualElement = actual.elements[index];
      return actualElement !== undefined && targetTypeMatchesExpected(element, actualElement, typeParameterBindings);
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
      return actualArgument !== undefined && targetTypeMatchesExpected(argument, actualArgument, typeParameterBindings);
    });
  }
  if (expected.kind === "pointer" && actual.kind === "pointer") {
    return targetTypeMatchesExpected(expected.pointee, actual.pointee, typeParameterBindings);
  }
  if (expected.kind === "function-pointer" && actual.kind === "function-pointer" && expected.args.length === actual.args.length) {
    return targetTypeMatchesExpected(expected.result, actual.result, typeParameterBindings) &&
      expected.args.every((argument, index) => {
        const actualArgument = actual.args[index];
        return actualArgument !== undefined && targetTypeMatchesExpected(argument, actualArgument, typeParameterBindings);
      });
  }
  return false;
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
