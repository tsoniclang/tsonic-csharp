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
} from "./target-types.js";
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

function resolveUnionMemberTargetType(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
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
