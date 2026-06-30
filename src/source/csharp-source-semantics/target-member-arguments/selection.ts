import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../target-types.js";
import {
  getEffectiveArgumentForTargetParameter,
} from "./argument-passing.js";
import {
  asNodeSubject,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  getParameterForArgument,
  targetArityMatches,
  targetMemberArityPenalty,
} from "./arity.js";
import {
  targetTypeArgumentMatchScore,
} from "./type-matching.js";
import {
  getDeclaringTypeParameterBindings,
  substituteTargetMemberTypeParameters,
} from "./type-substitution.js";
import {
  targetTypeRefIsClosed,
} from "../target-ref-utils.js";
import type {
  TargetMemberSelectionOptions,
  TargetMemberSelectionRequest,
  TargetTypeRefResolver,
} from "./types.js";

export function selectTargetMember(
  candidates: readonly CsharpTargetMember[],
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): CsharpTargetMember | undefined {
  const matching = candidates.flatMap((member) => {
    const match = targetMemberMatch(member, request, context, resolveTargetTypeRef, options);
    return match === undefined ? [] : [match];
  });
  const bestScore = Math.min(...matching.map((match) => match.score));
  const best = matching.filter((match) => match.score === bestScore);
  if (best.length === 1) {
    return best[0]?.member;
  }
  const preferred = options.preferredMemberId === undefined
    ? []
    : best.filter((match) => match.member.id === options.preferredMemberId);
  return preferred.length === 1 ? preferred[0]?.member : undefined;
}

export function selectExactTargetMember(
  member: CsharpTargetMember,
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): CsharpTargetMember | undefined {
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
    const argumentType = getTargetTypeRefForArgument(
      effectiveArgument.subject,
      context,
      resolveTargetTypeRef,
    );
    if (
      argumentType !== undefined &&
      targetParameterAcceptsClosedSourceArgument(parameter) &&
      request.sourceSelectedSignature !== undefined &&
      targetTypeRefIsClosed(argumentType)
    ) {
      continue;
    }
    if (argumentType === undefined && targetParameterAcceptsCheckedSourceArgument(parameter) && request.sourceSelectedSignature !== undefined) {
      continue;
    }
    if (targetTypeArgumentMatchScore(
      getExpectedTargetTypeForArgument(parameter),
      argumentType,
      effectiveArgument.subject,
      context,
      typeParameterBindings,
      options,
    ) === undefined) {
      return undefined;
    }
  }
  return substituteTargetMemberTypeParameters(
    member,
    typeParameterBindings,
  );
}

function targetMemberMatch(
  member: CsharpTargetMember,
  request: TargetMemberSelectionRequest,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions,
): { readonly member: CsharpTargetMember; readonly score: number } | undefined {
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
    const argumentType = getTargetTypeRefForArgument(
      effectiveArgument.subject,
      context,
      resolveTargetTypeRef,
    );
    if (
      argumentType !== undefined &&
      targetParameterAcceptsClosedSourceArgument(parameter) &&
      request.sourceSelectedSignature !== undefined &&
      targetTypeRefIsClosed(argumentType)
    ) {
      argumentScore += 20;
      continue;
    }
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

function getTargetTypeRefForArgument(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): ReturnType<TargetTypeRefResolver> {
  const direct = resolveTargetTypeRef(subject, context);
  if (direct !== undefined && direct.kind !== "type-parameter") {
    return direct;
  }
  const checked = getCheckedExpressionTargetTypeRef(subject, context, resolveTargetTypeRef);
  return checked !== undefined && (direct === undefined || checked.kind !== "type-parameter")
    ? checked
    : direct;
}

function getCheckedExpressionTargetTypeRef(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: TargetTypeRefResolver,
): ReturnType<TargetTypeRefResolver> {
  const node = asNodeSubject(subject);
  const compiler = context.compiler;
  if (
    node === undefined ||
    compiler === undefined
  ) {
    return undefined;
  }
  try {
    if (!isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)) {
      return undefined;
    }
    const sourceFile = compiler.ast.getSourceFile(node);
    return resolveTargetTypeRef(compiler.checker.getTypeAtLocation(node, { sourceFile }), context, { sourceFile });
  } catch {
    return undefined;
  }
}

function targetParameterAcceptsCheckedSourceArgument(parameter: CsharpTargetParameter): boolean {
  return parameter.csharpAcceptsCheckedSourceArgument === true;
}

function targetParameterAcceptsClosedSourceArgument(parameter: CsharpTargetParameter): boolean {
  return parameter.csharpAcceptsClosedSourceArgument === true ||
    targetParameterAcceptsCheckedSourceArgument(parameter);
}

function getTargetArgumentSubjectsForMember(
  member: CsharpTargetMember,
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

function getExpectedTargetTypeForArgument(parameter: CsharpTargetParameter) {
  return parameter.paramsArray === true && parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}
