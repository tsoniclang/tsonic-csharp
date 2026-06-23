import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  TargetBindingFact,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isControlFlowLabelIdentifier,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
} from "./symbol-utils.js";

export function findTargetBinding(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = resolveTargetBinding(subject, context);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

export function resolveTargetBinding(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetBindingFact | undefined {
  if (subject === undefined) {
    return undefined;
  }
  return context.factResolver.resolve(subject, targetBindingFactKey);
}

export function resolveTargetBindingForReference(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetBindingFact | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return resolveTargetBinding(subject, context);
  }
  const sourceFile = ast.getSourceFile(node);
  const semanticType = getSemanticTypeForNode(node, context, sourceFile);
  const typeBinding = resolveTargetBinding(semanticType, context) ??
    resolveTargetBinding(semanticType?.symbol, context);
  const symbol = getSymbolAtReferenceNode(node, context, sourceFile);
  const resolvedSymbol = getResolvedSymbolForReferenceNode(node, context, sourceFile);
  const referenceBinding = resolveTargetBinding(node, context) ??
    resolveTargetBinding(symbol, context) ??
    resolveTargetBinding(getAliasedSymbolForReference(symbol, context, sourceFile), context) ??
    resolveTargetBinding(resolvedSymbol, context) ??
    resolveTargetBinding(getAliasedSymbolForReference(resolvedSymbol, context, sourceFile), context);
  if (isTypeReferenceQueryNode(node, context)) {
    return referenceBinding ?? typeBinding;
  }
  return referenceBinding;
}

function getSemanticTypeForNode(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile | undefined,
): Type | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined) {
    return undefined;
  }
  if (isControlFlowLabelIdentifier(ast, node)) {
    return undefined;
  }
  return isTypeSyntaxNode(ast, node)
    ? checker.getTypeFromTypeNode(node, { sourceFile })
    : checker.getTypeAtLocation(node, { sourceFile });
}

function getSymbolAtReferenceNode(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile | undefined,
): Symbol | undefined {
  const reference = getReferenceQueryNode(node, context);
  return reference === undefined ? undefined : context.compiler?.checker.getSymbolAtLocation(reference, { sourceFile });
}

function getResolvedSymbolForReferenceNode(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile | undefined,
): Symbol | undefined {
  const reference = getReferenceQueryNode(node, context);
  return reference === undefined ? undefined : context.compiler?.checker.getResolvedSymbol(reference, { sourceFile });
}

function getReferenceQueryNode(
  node: Node | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (isControlFlowLabelIdentifier(ast, node)) {
    return undefined;
  }
  if (ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsQualifiedName(node)) {
    return node;
  }
  if (ast.is.IsTypeReferenceNode(node)) {
    return asNodeSubject(getNodeField(node, "TypeName"));
  }
  if (ast.is.IsExpressionWithTypeArguments(node)) {
    return asNodeSubject(getNodeField(node, "Expression"));
  }
  return undefined;
}

function isTypeReferenceQueryNode(
  node: Node,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  if (isTypeSyntaxNode(ast, node)) {
    return true;
  }
  let parent = ast.parent(node);
  let current: Node | undefined = node;
  while (parent !== undefined && ast.is.IsQualifiedName(parent)) {
    current = parent;
    parent = ast.parent(parent);
  }
  if (parent === undefined || !ast.is.IsTypeReferenceNode(parent)) {
    return false;
  }
  return asNodeSubject(getNodeField(parent, "TypeName")) === current;
}

function getAliasedSymbolForReference(
  symbol: Symbol | undefined,
  context: ExtensionObservationContext,
  sourceFile: SourceFile | undefined,
): Symbol | undefined {
  const checker = context.compiler?.checker;
  return checker === undefined ? undefined : getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
}
