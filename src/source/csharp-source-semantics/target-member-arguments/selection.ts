import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
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
  bindTargetTypeParameter,
  getDeclaringTypeParameterBindings,
  substituteTargetMemberTypeParameters,
  substituteTargetTypeRef,
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
  const typeParameterBindings = getSelectedTargetMemberTypeParameterBindings(member, options);
  if (typeParameterBindings === undefined) {
    return undefined;
  }
  const selectedTypeParameterBindings = new Set(typeParameterBindings.keys());
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(member.parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const effectiveArgument = getEffectiveArgumentForTargetParameter(parameter, argument, context, {
      parameterIndex: index,
      selectedProviderDeclaration: request.selectedProviderDeclaration,
    });
    if (effectiveArgument === undefined) {
      return undefined;
    }
    const argumentType = getTargetTypeRefForArgument(
      effectiveArgument.subject,
      context,
      resolveTargetTypeRef,
    );
    if (
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member) &&
      targetParameterAcceptsTstsCheckedSourceGenericArgument(parameter, typeParameterBindings, selectedTypeParameterBindings)
    ) {
      continue;
    }
    if (
      argumentType !== undefined &&
      targetParameterAcceptsClosedSourceArgument(parameter) &&
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member) &&
      targetTypeRefIsClosed(argumentType)
    ) {
      continue;
    }
    if (
      targetParameterAcceptsCheckedSourceArgument(
        parameter,
        argumentType,
        sourceSelectionProvesExactTargetMember(request, member),
      ) &&
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member)
    ) {
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
  const typeParameterBindings = getSelectedTargetMemberTypeParameterBindings(member, options);
  if (typeParameterBindings === undefined) {
    return undefined;
  }
  const selectedTypeParameterBindings = new Set(typeParameterBindings.keys());
  let argumentScore = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    const argument = arguments_[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const effectiveArgument = getEffectiveArgumentForTargetParameter(parameter, argument, context, {
      parameterIndex: index,
      selectedProviderDeclaration: request.selectedProviderDeclaration,
    });
    if (effectiveArgument === undefined) {
      return undefined;
    }
    const argumentType = getTargetTypeRefForArgument(
      effectiveArgument.subject,
      context,
      resolveTargetTypeRef,
    );
    if (
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member) &&
      targetParameterAcceptsTstsCheckedSourceGenericArgument(parameter, typeParameterBindings, selectedTypeParameterBindings)
    ) {
      argumentScore += targetTypeArgumentMatchScore(
        getExpectedTargetTypeForArgument(parameter),
        argumentType,
        effectiveArgument.subject,
        context,
        typeParameterBindings,
        options,
      ) ?? 20;
      continue;
    }
    if (
      argumentType !== undefined &&
      targetParameterAcceptsClosedSourceArgument(parameter) &&
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member) &&
      targetTypeRefIsClosed(argumentType)
    ) {
      argumentScore += targetTypeArgumentMatchScore(
        getExpectedTargetTypeForArgument(parameter),
        argumentType,
        effectiveArgument.subject,
        context,
        typeParameterBindings,
        options,
      ) ?? 20;
      continue;
    }
    if (
      targetParameterAcceptsCheckedSourceArgument(
        parameter,
        argumentType,
        sourceSelectionProvesExactTargetMember(request, member),
      ) &&
      request.sourceSelectedSignature !== undefined &&
      sourceSelectionProvesTargetMember(request, member)
    ) {
      argumentScore += targetTypeArgumentMatchScore(
        getExpectedTargetTypeForArgument(parameter),
        argumentType,
        effectiveArgument.subject,
        context,
        typeParameterBindings,
        options,
      ) ?? 20;
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
  if (!isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  return resolveTargetTypeRef(compiler.checker.getTypeAtLocation(node, { sourceFile }), context, { sourceFile });
}

function targetParameterAcceptsCheckedSourceArgument(
  parameter: CsharpTargetParameter,
  argumentType: TargetTypeRef | undefined,
  exactSourceSelection: boolean,
): boolean {
  if (argumentType === undefined) {
    return parameter.csharpAcceptsCheckedSourceArgument === true ||
      (exactSourceSelection && parameter.type.kind === "source-primitive" && parameter.passingMode === "by-value") ||
      (exactSourceSelection && parameter.passingMode !== "by-value" && targetParameterTypeIsSourcePrimitiveCarrier(parameter.type));
  }
  return (parameter.type.kind === "source-primitive" &&
      argumentType.kind === "source-primitive" &&
      argumentType.name === parameter.type.name) ||
    (parameter.passingMode !== "by-value" && targetParameterTypeIsSourcePrimitiveCarrier(parameter.type));
}

function sourceSelectionProvesTargetMember(
  request: TargetMemberSelectionRequest,
  member: CsharpTargetMember,
): boolean {
  if (sourceSelectionProvesExactTargetMember(request, member)) {
    return true;
  }
  return request.sourceSelectedIdentity !== undefined &&
    member.sourceIdentityKeys?.includes(request.sourceSelectedIdentity) === true;
}

function sourceSelectionProvesExactTargetMember(
  request: TargetMemberSelectionRequest,
  member: CsharpTargetMember,
): boolean {
  const sourceSelectedSignature = request.sourceSelectedSignature;
  const signatureId = (sourceSelectedSignature as { readonly signatureId?: unknown } | undefined)?.signatureId;
  return (
    typeof signatureId === "string" &&
    (signatureId === member.id || signatureId === member.providerSourceSignatureId)
  );
}

function targetParameterAcceptsClosedSourceArgument(parameter: CsharpTargetParameter): boolean {
  return parameter.csharpAcceptsClosedSourceArgument === true;
}

function targetParameterAcceptsTstsCheckedSourceGenericArgument(
  parameter: CsharpTargetParameter,
  typeParameterBindings: ReadonlyMap<string, TargetTypeRef>,
  selectedTypeParameterBindings: ReadonlySet<string>,
): boolean {
  return targetTypeRefHasSelectedBoundTypeParameter(parameter.type, typeParameterBindings, selectedTypeParameterBindings) &&
    targetTypeRefIsClosed(substituteTargetTypeRef(parameter.type, typeParameterBindings));
}

function targetTypeRefHasSelectedBoundTypeParameter(
  type: TargetTypeRef,
  typeParameterBindings: ReadonlyMap<string, TargetTypeRef>,
  selectedTypeParameterBindings: ReadonlySet<string>,
): boolean {
  switch (type.kind) {
    case "type-parameter":
      return typeParameterBindings.has(type.name) && selectedTypeParameterBindings.has(type.name);
    case "target-named":
      return (type.typeArguments ?? []).some((argument) => targetTypeRefHasSelectedBoundTypeParameter(argument, typeParameterBindings, selectedTypeParameterBindings));
    case "array":
      return targetTypeRefHasSelectedBoundTypeParameter(type.element, typeParameterBindings, selectedTypeParameterBindings);
    case "tuple":
      return type.elements.some((element) => targetTypeRefHasSelectedBoundTypeParameter(element, typeParameterBindings, selectedTypeParameterBindings));
    case "pointer":
      return targetTypeRefHasSelectedBoundTypeParameter(type.pointee, typeParameterBindings, selectedTypeParameterBindings);
    case "function-pointer":
      return targetTypeRefHasSelectedBoundTypeParameter(type.result, typeParameterBindings, selectedTypeParameterBindings) ||
        type.args.some((argument) => targetTypeRefHasSelectedBoundTypeParameter(argument, typeParameterBindings, selectedTypeParameterBindings));
    case "associated-type":
      return targetTypeRefHasSelectedBoundTypeParameter(type.owner, typeParameterBindings, selectedTypeParameterBindings);
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

function targetParameterTypeIsSourcePrimitiveCarrier(type: CsharpTargetParameter["type"]): boolean {
  switch (type.kind) {
    case "source-primitive":
      return true;
    case "array":
      return targetParameterTypeIsSourcePrimitiveCarrier(type.element);
    case "tuple":
      return type.elements.every(targetParameterTypeIsSourcePrimitiveCarrier);
    default:
      return false;
  }
}

function getSelectedTargetMemberTypeParameterBindings(
  member: CsharpTargetMember,
  options: TargetMemberSelectionOptions,
): Map<string, TargetTypeRef> | undefined {
  const bindings = getDeclaringTypeParameterBindings(options);
  const methodTargetTypeArguments = options.methodTargetTypeArguments;
  if (methodTargetTypeArguments === undefined) {
    return bindings;
  }
  const methodTypeParameters = member.typeParameters ?? [];
  if (methodTypeParameters.length === 0) {
    return bindings;
  }
  if (methodTargetTypeArguments.length !== methodTypeParameters.length) {
    return undefined;
  }
  for (let index = 0; index < methodTypeParameters.length; index += 1) {
    const parameter = methodTypeParameters[index];
    const argument = methodTargetTypeArguments[index];
    if (parameter === undefined || argument === undefined || !bindTargetTypeParameter(parameter.name, argument, bindings)) {
      return undefined;
    }
  }
  return bindings;
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
