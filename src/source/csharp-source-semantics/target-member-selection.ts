import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  ProviderVirtualDeclarationFact,
  SourceFile,
  SourcePrimitiveKind,
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  stripMetadataArity,
  targetTypeRefEquals,
} from "./target-ref-utils.js";

export interface TargetTypeRefResolutionOptions {
  readonly allowRuntimeCarrier?: boolean;
  readonly allowSemanticTypeQuery?: boolean;
  readonly sourceFile?: SourceFile;
}

export type TargetTypeRefResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options?: TargetTypeRefResolutionOptions,
) => TargetTypeRef | undefined;

export function findTargetMemberForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  resolveTargetTypeRef: TargetTypeRefResolver,
): TargetMember | undefined {
  const candidates = getTargetMemberCandidates(binding, declaration, sourceName);
  return selectTargetMember(candidates, request.arguments, context, resolveTargetTypeRef);
}

export function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): TargetMember | undefined {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  return memberName === undefined ? undefined : members.find((member) => member.sourceName === memberName);
}

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

export function isLiteralRepresentableAsTargetType(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return false;
  }
  const kind = ast.kindName(node);
  if (expected.kind === "target-named" && expected.id === "System.String") {
    return kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral";
  }
  if (expected.kind !== "source-primitive") {
    return false;
  }
  switch (expected.name) {
    case "bool":
      return ast.kindName(node) === "KindTrueKeyword" || ast.kindName(node) === "KindFalseKeyword";
    case "char": {
      if (!ast.is.IsStringLiteral(node)) {
        return false;
      }
      return [...ast.text(node)].length === 1;
    }
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && isNumberRepresentableAsPrimitive(value, expected.name);
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && Number.isFinite(value);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = getBigIntLiteralValue(node, context);
      return value !== undefined && isBigIntRepresentableAsPrimitive(value, expected.name);
    }
  }
}

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.filter((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  if (memberName !== undefined) {
    return members.filter((member) => member.sourceName === memberName);
  }
  return members.filter((member) => member.kind === "constructor");
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

function getNumericLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindNumericLiteral") {
    return parseFiniteNumberLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindNumericLiteral") {
    return undefined;
  }
  const value = parseFiniteNumberLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function getBigIntLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): bigint | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindBigIntLiteral") {
    return parseBigIntLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindBigIntLiteral") {
    return undefined;
  }
  const value = parseBigIntLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function parseFiniteNumberLiteral(text: string): number | undefined {
  const value = Number(text.split("_").join(""));
  return Number.isFinite(value) ? value : undefined;
}

function parseBigIntLiteral(text: string): bigint | undefined {
  const normalized = text.split("_").join("").replace(/n$/u, "");
  try {
    return BigInt(normalized);
  } catch {
    return undefined;
  }
}

function getPrefixUnaryOperatorKindName(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  const operator = getNodeField(node, "Operator");
  if (typeof operator === "number") {
    return ast.kindName({ Kind: operator } as Node);
  }
  if (typeof operator === "string") {
    return operator;
  }
  const token = asNodeSubject(getNodeField(node, "OperatorToken"));
  return token === undefined ? undefined : ast.kindName(token);
}

function isNumberRepresentableAsPrimitive(value: number, primitive: SourcePrimitiveKind): boolean {
  if (!Number.isInteger(value)) {
    return false;
  }
  switch (primitive) {
    case "int8":
      return value >= -128 && value <= 127;
    case "uint8":
      return value >= 0 && value <= 255;
    case "int16":
      return value >= -32768 && value <= 32767;
    case "uint16":
      return value >= 0 && value <= 65535;
    case "int32":
      return value >= -2147483648 && value <= 2147483647;
    case "uint32":
      return value >= 0 && value <= 4294967295;
    case "native-int":
      return value >= -2147483648 && value <= 2147483647;
    case "native-uint":
      return value >= 0 && value <= 4294967295;
    default:
      return false;
  }
}

function isBigIntRepresentableAsPrimitive(value: bigint, primitive: SourcePrimitiveKind): boolean {
  switch (primitive) {
    case "int64":
      return value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
    case "uint64":
      return value >= 0n && value <= (1n << 64n) - 1n;
    case "int128":
      return value >= -(1n << 127n) && value <= (1n << 127n) - 1n;
    case "uint128":
      return value >= 0n && value <= (1n << 128n) - 1n;
    default:
      return false;
  }
}
