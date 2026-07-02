import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  csharpNullableTargetType,
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  csharpRuntimeUnionTargetType,
} from "./target-types.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  isTstsNullType,
  isTstsUndefinedType,
} from "./nullish-types.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function getNullableUnionTargetTypeRefFromSyntax(
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
  const inner = resolveUnionMemberTargetType(nonNullish[0]!, context, options, host, resolver);
  return inner === undefined ? undefined : csharpNullableTargetType(inner);
}

export function getRuntimeUnionTargetTypeRefFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  if (options.allowRuntimeCarrier === false) {
    return undefined;
  }
  const members = getNodeList(getNodeField(node, "Types"));
  const nonNullish = members.filter((member) => !isNullishTypeSyntax(member, context));
  if (nonNullish.length < 2) {
    return undefined;
  }
  const memberCarriers = members.map((member) => resolveUnionMemberTargetType(member, context, options, host, resolver));
  if (!memberCarriers.every((member): member is TargetTypeRef => member !== undefined)) {
    return undefined;
  }
  if (memberCarriers.some((member, index) => memberCarriers.some((candidate, candidateIndex) => candidateIndex < index && targetTypeRefEquals(candidate, member)))) {
    return undefined;
  }
  return csharpRuntimeUnionTargetType(memberCarriers);
}

function resolveUnionMemberTargetType(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const nullishCarrier = resolveNullishUnionMemberTargetType(node, context);
  if (nullishCarrier !== undefined) {
    return nullishCarrier;
  }
  const syntaxType = resolver.resolveSubject(node, context, options, host);
  if (syntaxType !== undefined) {
    return syntaxType;
  }
  const sourceFile = context.compiler?.ast.getSourceFile(node);
  const semanticType = sourceFile === undefined
    ? undefined
    : context.compiler?.checker.getTypeFromTypeNode(node, { sourceFile });
  return resolver.resolveType(semanticType, context, options, host) ??
    resolver.resolveType(semanticType, context, { ...options, allowRuntimeCarrier: true }, host);
}

function resolveNullishUnionMemberTargetType(
  node: Node,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const compiler = context.compiler;
  const ast = compiler?.ast;
  if (compiler === undefined || ast === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const semanticType = sourceFile === undefined
    ? undefined
    : compiler.checker.getTypeFromTypeNode(node, { sourceFile });
  if (isTstsUndefinedType(semanticType, compiler.typeShape)) {
    return csharpRuntimeUndefinedTargetType();
  }
  if (isTstsNullType(semanticType, compiler.typeShape)) {
    return csharpRuntimeNullTargetType();
  }
  return undefined;
}

function isNullishTypeSyntax(node: Node, context: ExtensionObservationContext): boolean {
  const compiler = context.compiler;
  const ast = compiler?.ast;
  if (compiler === undefined || ast === undefined) {
    return false;
  }
  const sourceFile = ast.getSourceFile(node);
  const semanticType = sourceFile === undefined
    ? undefined
    : compiler.checker.getTypeFromTypeNode(node, { sourceFile });
  if (semanticType !== undefined) {
    return compiler.typeShape.isNullish(semanticType);
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
  return false;
}
