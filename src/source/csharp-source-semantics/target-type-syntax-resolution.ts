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
  getTargetTypeRefFromTypeReferenceSyntax,
} from "./target-type-reference-syntax.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";
import {
  getNullableUnionTargetTypeRefFromSyntax,
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
