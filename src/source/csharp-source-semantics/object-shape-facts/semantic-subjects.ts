import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  getDeclarationTypeNode,
} from "../symbol-utils.js";
import {
  asType,
} from "../target-ref-utils.js";

export function getSemanticSubjects(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): readonly (Node | Symbol | Type)[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  const node = asNodeSubject(subject);
  const sourceFile = node === undefined ? undefined : compiler.ast.getSourceFile(node);
  const subjects: (Node | Symbol | Type)[] = [];
  const declarationType = getDeclarationTypeNode(subject, context);
  if (declarationType !== undefined) {
    subjects.push(declarationType);
  }
  const symbol = node === undefined || sourceFile === undefined
    || isTypeSyntaxNodeForObjectShapeRecording(compiler.ast, node)
    ? undefined
    : getSafeObjectShapeSymbol(node, sourceFile, context);
  if (symbol !== undefined) {
    subjects.push(symbol);
  }
  const type = getTypeSubject(subject, context, node, sourceFile);
  if (type !== undefined) {
    subjects.push(type);
    if (type.symbol !== undefined) {
      subjects.push(type.symbol);
    }
  }
  return subjects;
}

export function getSafeObjectShapeSymbol(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): Symbol | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    if (isControlFlowLabelIdentifier(compiler.ast, node)) {
      return undefined;
    }
    if (!isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)) {
      return undefined;
    }
    const symbol = compiler.checker.getSymbolAtLocation(node, { sourceFile });
    if (symbol !== undefined || !isResolvedObjectShapeSymbolLookupNode(compiler.ast, node)) {
      return symbol;
    }
    return compiler.checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function isResolvedObjectShapeSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsPropertyAccessExpression(node);
}

function getTypeSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
): Type | undefined {
  if (isTypeSubject(subject)) {
    return subject;
  }
  const compiler = context.compiler;
  if (compiler === undefined || node === undefined || sourceFile === undefined) {
    return undefined;
  }
  try {
    if (isControlFlowLabelIdentifier(compiler.ast, node)) {
      return undefined;
    }
    if (isTypeSyntaxNodeForObjectShapeRecording(compiler.ast, node)) {
      return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
    }
    return isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
      ? compiler.checker.getTypeAtLocation(node, { sourceFile })
      : undefined;
  } catch {
    return undefined;
  }
}

function isTypeSyntaxNodeForObjectShapeRecording(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsKeywordTypeNode(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsUnionTypeNode(node) ||
    ast.is.IsIntersectionTypeNode(node) ||
    ast.is.IsConditionalTypeNode(node) ||
    ast.is.IsInferTypeNode(node) ||
    ast.is.IsArrayTypeNode(node) ||
    ast.is.IsIndexedAccessTypeNode(node) ||
    ast.is.IsLiteralTypeNode(node) ||
    ast.is.IsThisTypeNode(node) ||
    ast.is.IsMappedTypeNode(node) ||
    ast.is.IsTupleTypeNode(node) ||
    ast.is.IsOptionalTypeNode(node) ||
    ast.is.IsRestTypeNode(node) ||
    ast.is.IsParenthesizedTypeNode(node) ||
    ast.is.IsFunctionTypeNode(node) ||
    ast.is.IsConstructorTypeNode(node) ||
    ast.is.IsTemplateLiteralTypeNode(node) ||
    ast.is.IsImportTypeNode(node);
}

function isTypeSubject(subject: ExtensionFactSubject | undefined): subject is Type {
  return asType(subject) !== undefined;
}
