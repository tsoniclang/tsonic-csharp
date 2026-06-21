import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import {
  findTargetBinding,
} from "./provider-bindings.js";
import {
  getLiteralTargetTypeRefForKnownOperatorOperand,
} from "./checked-operator-mapping.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  isVoidTargetType,
  unwrapNullableTargetType,
} from "./target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asType,
} from "./target-ref-utils.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";

export interface CsharpRecursiveTargetTypeResolver {
  readonly resolveSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined;
  readonly resolveType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
    host: CsharpTargetTypeResolutionHost,
  ) => TargetTypeRef | undefined;
}

export function resolveTargetTypeRefFromKeywordTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  switch (ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpTargetNamedType("System.String");
    case "KindBigIntKeyword":
      return csharpTargetNamedType("System.Numerics.BigInteger");
    case "KindVoidKeyword":
      return csharpTargetNamedType("System.Void");
    default:
      return undefined;
  }
}

export function getTargetTypeRefFromSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  const keywordType = resolveTargetTypeRefFromKeywordTypeSyntax(ast, node);
  if (keywordType !== undefined) {
    return keywordType;
  }
  if (ast.is.IsNewExpression(node)) {
    return getTargetTypeRefFromConstructedExpressionSyntax(node, context, options, host, resolver);
  }
  if (ast.is.IsTypeReferenceNode(node)) {
    return getTargetTypeRefFromTypeReferenceSyntax(node, context, options, host, resolver);
  }
  if (ast.is.IsArrayTypeNode(node)) {
    const element = resolver.resolveSubject(asNodeSubject(getNodeField(node, "ElementType")), context, options, host);
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (ast.is.IsUnionTypeNode(node)) {
    const nullable = getNullableUnionTargetTypeRefFromSyntax(node, context, options, host, resolver);
    if (nullable !== undefined) {
      return nullable;
    }
  }
  if (ast.is.IsTypeLiteralNode(node)) {
    return host.getCsharpObjectShapeFactForSubject(node, context)?.targetType;
  }
  if (ast.is.IsFunctionTypeNode(node) || ast.is.IsConstructorTypeNode(node)) {
    return resolveFunctionTargetTypeRefFromSignatureLikeSubject(node, context, options, host, resolver);
  }
  return undefined;
}

export function getTargetTypeRefFromCheckedExpressionSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (ast.is.IsParenthesizedExpression(node)) {
    return resolver.resolveSubject(asNodeSubject(getNodeField(node, "Expression")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
  }
  if (ast.kindName(node) === "KindPrefixUnaryExpression") {
    const operator = getPrefixUnaryOperatorText(ast, node);
    const operandType = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Operand")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
    if (operator === "!") {
      return csharpSourcePrimitiveTargetType("bool");
    }
    if (operator === "~") {
      return isIntegralTargetTypeRef(operandType) ? operandType : undefined;
    }
    return operandType;
  }
  if (!ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const operator = getBinaryOperatorText(ast, node);
  if (operator === undefined) {
    return undefined;
  }
  const operandOptions = operator === "??"
    ? {
        ...options,
        allowSemanticTypeQuery: true,
      }
    : {
        ...options,
        allowSemanticTypeQuery: false,
      };
  const left = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Left")), context, {
    ...operandOptions,
  }, host);
  const rightSubject = asNodeSubject(getNodeField(node, "Right"));
  const right = resolver.resolveSubject(rightSubject, context, {
    ...operandOptions,
  }, host) ?? getLiteralTargetTypeRefForKnownOperatorOperand(left, rightSubject, context);
  if (operator === "===" ||
    operator === "==" ||
    operator === "!==" ||
    operator === "!=" ||
    operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=" ||
    operator === "&&" ||
    operator === "||") {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (operator === "??") {
    return unwrapNullableTargetType(left) ?? right;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left)) {
    return undefined;
  }
  return left;
}

export function resolveFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const childOptions = {
    ...options,
    allowRuntimeCarrier: true,
  };
  const parameters = getNodeList(getNodeField(node, "Parameters"))
    .map((parameter) => resolver.resolveSubject(asNodeSubject(getNodeField(parameter, "Type")), context, childOptions, host));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Type")), context, childOptions, host);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameters.length}`, parameters as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameters.length + 1}`, [...(parameters as readonly TargetTypeRef[]), returnType]);
}

function getTargetTypeRefFromConstructedExpressionSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined) {
    return undefined;
  }
  const binding = findTargetBinding(context, [expression]);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = getNodeList(getNodeField(node, "TypeArguments"))
    .map((argument) => resolver.resolveSubject(argument, context, options, host));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-named",
    id: binding.id,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
}

function getTargetTypeRefFromTypeReferenceSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (ast === undefined || checker === undefined || typeName === undefined) {
    return undefined;
  }
  const type = asType(checker.getTypeFromTypeNode(node));
  const candidateSubjects: readonly (ExtensionFactSubject | undefined)[] = [
    node,
    typeName,
    type?.symbol,
    checker.getSymbolAtLocation(typeName),
  ];
  for (const candidate of candidateSubjects) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const aliasedType = getTargetTypeRefFromTypeAliasDeclarations(candidateSubjects, node, context, options, host, resolver);
  if (aliasedType !== undefined) {
    return aliasedType;
  }
  for (const candidate of [type, type?.symbol]) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const binding = findTargetBinding(context, candidateSubjects);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = ast.typeArguments(node).map((argument) => resolver.resolveSubject(argument, context, options, host));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return csharpTargetNamedType(binding.id, typeArguments as readonly TargetTypeRef[]);
}

function getTargetTypeRefFromTypeAliasDeclarations(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const declarations = getSymbolDeclarations(subject);
    for (const declaration of declarations) {
      const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
      if (typeNode === undefined || typeNode === currentNode) {
        continue;
      }
      const result = resolver.resolveSubject(typeNode, context, options, host);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function getNullableUnionTargetTypeRefFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const members = getNodeList(getNodeField(node, "Types"));
  const nonNullish = members.filter((member) => !isNullishTypeSyntax(member, context));
  if (nonNullish.length !== 1 || nonNullish.length === members.length) {
    return undefined;
  }
  const inner = resolver.resolveSubject(nonNullish[0], context, options, host);
  return inner === undefined ? undefined : csharpTargetNamedType("System.Nullable`1", [inner]);
}

function isNullishTypeSyntax(node: Node, context: ExtensionObservationContext): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  const kind = ast.kindName(node);
  if (kind === "KindNullKeyword" || kind === "KindUndefinedKeyword") {
    return true;
  }
  if (ast.is.IsLiteralTypeNode(node)) {
    const literal = asNodeSubject(getNodeField(node, "Literal"));
    const literalKind = ast.kindName(literal);
    return literalKind === "KindNullKeyword" || literalKind === "KindUndefinedKeyword";
  }
  if (ast.is.IsTypeReferenceNode(node)) {
    const typeName = asNodeSubject(getNodeField(node, "TypeName"));
    return ast.text(typeName) === "undefined";
  }
  return false;
}
