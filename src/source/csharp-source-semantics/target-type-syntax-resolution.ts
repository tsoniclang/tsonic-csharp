import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import {
  getTargetTypeRefFromConstructedExpressionSyntax,
} from "./target-type-constructed-expression-syntax.js";
import {
  resolveFunctionTargetTypeRefFromSignatureLikeSubject,
} from "./target-type-function-signatures.js";
import {
  resolveTargetTypeRefFromKeywordTypeSyntax,
} from "./target-type-keywords.js";
import {
  resolveTargetTypeRefFromLiteralTypeSyntax,
} from "./target-type-literal-syntax.js";
import {
  getTargetTypeRefFromTypeReferenceSyntax,
} from "./target-type-reference-syntax.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";
import {
  getNullableUnionTargetTypeRefFromSyntax,
  getRuntimeUnionTargetTypeRefFromSyntax,
} from "./target-type-union-syntax.js";

export type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";
export {
  getTargetTypeRefFromCheckedExpressionSyntax,
} from "./target-type-checked-expression-syntax.js";
export {
  resolveFunctionTargetTypeRefFromSignatureLikeSubject,
} from "./target-type-function-signatures.js";
export {
  resolveTargetTypeRefFromKeywordTypeSyntax,
} from "./target-type-keywords.js";

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
  const literalType = resolveTargetTypeRefFromLiteralTypeSyntax(ast, node);
  if (literalType !== undefined) {
    return literalType;
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
  if (ast.is.IsTupleTypeNode(node)) {
    const elements = ast.elements(node)
      .map((element) => resolver.resolveSubject(getTupleElementTypeNode(asNodeSubject(element)), context, options, host));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
  }
  if (ast.is.IsParenthesizedTypeNode(node)) {
    return resolver.resolveSubject(asNodeSubject(getNodeField(node, "Type")), context, options, host);
  }
  if (ast.is.IsUnionTypeNode(node)) {
    const nullable = getNullableUnionTargetTypeRefFromSyntax(node, context, options, host, resolver);
    if (nullable !== undefined) {
      return nullable;
    }
    const runtimeUnion = getRuntimeUnionTargetTypeRefFromSyntax(node, context, options, host, resolver);
    if (runtimeUnion !== undefined) {
      return runtimeUnion;
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

function getTupleElementTypeNode(element: ReturnType<typeof asNodeSubject>): ReturnType<typeof asNodeSubject> {
  return asNodeSubject(getNodeField(element, "Type")) ?? asNodeSubject(getNodeField(element, "type")) ?? element;
}
