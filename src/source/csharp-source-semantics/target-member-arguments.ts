import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
import {
  stripMetadataArity,
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

export function selectTargetMember(
  candidates: readonly TargetMember[],
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): TargetMember | undefined {
  const matching = candidates.filter((member) =>
    targetMemberMatchesArguments(member, arguments_, context, resolveTargetTypeRef));
  return matching.length === 1 ? matching[0] : undefined;
}

function targetMemberMatchesArguments(
  member: TargetMember,
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): boolean {
  const parameterOffset = member.receiverPassing === "first-argument" ? 1 : 0;
  const parameters = member.parameters.slice(parameterOffset);
  if (!targetArityMatches(parameters, arguments_.length)) {
    return false;
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return false;
    }
    const argumentType = resolveTargetTypeRef(argument, context);
    if (!targetTypeAcceptsArgument(getExpectedTargetTypeForArgument(parameter), argumentType, argument, context, resolveTargetTypeRef)) {
      return false;
    }
  }
  return true;
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
  resolveTargetTypeRef: TargetTypeRefResolver,
): boolean {
  if (delegateTargetTypeAcceptsArgument(expected, subject, context)) {
    return true;
  }
  if (expected.kind === "type-parameter") {
    return actual !== undefined;
  }
  if (expected.kind === "opaque" && (expected.id === "any" || expected.id === "unknown")) {
    return true;
  }
  if (expected.kind === "target-named" && expected.id === "System.Object") {
    return true;
  }
  if (isLiteralRepresentableAsTargetType(expected, subject, context)) {
    return true;
  }
  if (actual === undefined) {
    return false;
  }
  if (targetTypeRefEquals(expected, actual)) {
    return true;
  }
  return structuralTargetTypeMatches(expected, actual, resolveTargetTypeRef);
}

function structuralTargetTypeMatches(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  _resolveTargetTypeRef: TargetTypeRefResolver,
): boolean {
  if (expected.kind === "array" && actual.kind === "array" && (expected.rank ?? 1) === (actual.rank ?? 1)) {
    return structuralTargetTypeMatches(expected.element, actual.element, _resolveTargetTypeRef);
  }
  if (expected.kind === "tuple" && actual.kind === "tuple" && expected.elements.length === actual.elements.length) {
    return expected.elements.every((element, index) => {
      const actualElement = actual.elements[index];
      return actualElement !== undefined && structuralTargetTypeMatches(element, actualElement, _resolveTargetTypeRef);
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
      return actualArgument !== undefined && structuralTargetTypeMatches(argument, actualArgument, _resolveTargetTypeRef);
    });
  }
  if (expected.kind === "pointer" && actual.kind === "pointer") {
    return structuralTargetTypeMatches(expected.pointee, actual.pointee, _resolveTargetTypeRef);
  }
  if (expected.kind === "function-pointer" && actual.kind === "function-pointer" && expected.args.length === actual.args.length) {
    return structuralTargetTypeMatches(expected.result, actual.result, _resolveTargetTypeRef) &&
      expected.args.every((argument, index) => {
        const actualArgument = actual.args[index];
        return actualArgument !== undefined && structuralTargetTypeMatches(argument, actualArgument, _resolveTargetTypeRef);
      });
  }
  return expected.kind === "type-parameter";
}

function delegateTargetTypeAcceptsArgument(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  if (expected.kind !== "target-named") {
    return false;
  }
  const stripped = stripMetadataArity(expected.id);
  if (stripped !== "System.Func" && stripped !== "System.Action" && stripped !== "System.Predicate") {
    return false;
  }
  const callbackParameterCount = getCallbackParameterCount(subject, context);
  if (callbackParameterCount === undefined) {
    return false;
  }
  const genericArgumentCount = (expected.typeArguments ?? []).length;
  const expectedParameterCount = stripped === "System.Func"
    ? genericArgumentCount - 1
    : genericArgumentCount;
  return callbackParameterCount === expectedParameterCount;
}

function getCallbackParameterCount(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (!ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) {
    return undefined;
  }
  return ast.parameters(node).length;
}
