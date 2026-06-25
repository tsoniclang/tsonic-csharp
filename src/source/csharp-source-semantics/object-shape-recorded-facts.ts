import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
  getDeclarationTypeNode,
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";
import {
  getSourceCoreStructMarkerDeclarationFromSubject,
  subjectIsSourceCoreStructDeclarationPayload,
} from "./source-core-struct-markers.js";
export {
  subjectIsSourceCoreStructDeclarationPayload,
} from "./source-core-struct-markers.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./target-types.js";

export function getRecordedCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  if (subjectIsSourceCoreStructDeclarationPayload(subject, context)) {
    return undefined;
  }
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context)) {
    return getRecordedCsharpObjectShapeFactForReference(subject, context);
  }
  const contextualShape = getRecordedCsharpObjectShapeFactForObjectLiteralContext(subject, context);
  if (contextualShape !== undefined) {
    return contextualShape;
  }
  const direct = context.facts.get(subject, csharpObjectShapeFactKey);
  if (direct !== undefined) {
    return direct;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  const declarationFact = declarationType === undefined ? undefined : context.facts.get(declarationType, csharpObjectShapeFactKey);
  if (declarationFact !== undefined) {
    return declarationFact;
  }
  const referenceFact = getRecordedCsharpObjectShapeFactForReference(subject, context);
  if (referenceFact !== undefined) {
    return referenceFact;
  }
  return getRecordedCsharpObjectShapeFactForSemanticType(subject, context);
}

function getRecordedCsharpObjectShapeFactForObjectLiteralContext(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined || compiler.ast.kindName(node) !== "KindObjectLiteralExpression") {
    return undefined;
  }
  const typeNode = getObjectLiteralTargetTypeNode(node, context);
  return typeNode === undefined
    ? undefined
    : getRecordedCsharpObjectShapeFactForReference(typeNode, context);
}

function getObjectLiteralTargetTypeNode(
  node: Node,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const parent = compiler.ast.parent(node);
  if (parent === undefined) {
    return undefined;
  }
  const parentKind = compiler.ast.kindName(parent);
  if (parentKind === "KindVariableDeclaration" || parentKind === "KindPropertyDeclaration") {
    const initializer = asNodeSubject(getNodeField(parent, "Initializer"));
    return initializer === node
      ? asNodeSubject(getNodeField(parent, "Type"))
      : undefined;
  }
  if (parentKind === "KindArrowFunction") {
    const body = asNodeSubject(getNodeField(parent, "Body"));
    return body === node
      ? asNodeSubject(getNodeField(parent, "Type"))
      : undefined;
  }
  if (parentKind !== "KindReturnStatement") {
    return undefined;
  }
  for (let current = compiler.ast.parent(parent); current !== undefined; current = compiler.ast.parent(current)) {
    const kind = compiler.ast.kindName(current);
    if (kind === "KindFunctionDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindConstructor" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor") {
      return asNodeSubject(getNodeField(current, "Type"));
    }
    if (kind === "KindSourceFile" || kind === "KindClassDeclaration") {
      return undefined;
    }
  }
  return undefined;
}

function getRecordedCsharpObjectShapeFactForReference(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  const referenceName = compiler.ast.kindName(node) === "KindTypeReference"
    ? asNodeSubject(getNodeField(node, "TypeName"))
    : node;
  if (referenceName === undefined) {
    return undefined;
  }
  const type = compiler.ast.kindName(node) === "KindTypeReference"
    ? compiler.checker.getTypeFromTypeNode(node, { sourceFile })
    : undefined;
  const typeAliasSymbol = (type as { readonly aliasSymbol?: ExtensionFactSubject } | undefined)?.aliasSymbol;
  const symbol = type === undefined
    ? getSymbolForDeclarationLookup(compiler.ast, compiler.checker, referenceName, sourceFile)
    : undefined;
  const aliasedSymbol = type === undefined ? getAliasedSymbolIfAvailable(compiler.checker, symbol, sourceFile) : undefined;
  for (const candidate of [node, referenceName, typeAliasSymbol, type, type?.symbol, symbol, aliasedSymbol]) {
    const fact = context.facts.get(candidate, csharpObjectShapeFactKey);
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function getRecordedCsharpObjectShapeFactForSemanticType(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  const type = getSemanticTypeForObjectShapeLookup(node, context);
  return context.facts.get(type, csharpObjectShapeFactKey) ??
    context.facts.get(type?.symbol, csharpObjectShapeFactKey);
}

export function subjectHasSourceDeclaredStructRuntimeCarrier(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  if (subjectReferencesSourceCoreStructMarkerDeclaration(subject, context)) {
    return true;
  }
  const direct = context.facts.get(subject, runtimeCarrierFactKey)?.carrier;
  if (isSourceDeclaredStructRuntimeCarrier(direct)) {
    return true;
  }
  const recorded = getRecordedCsharpObjectShapeFactForReference(subject, context);
  if (isSourceDeclaredStructRuntimeCarrier(recorded?.targetType)) {
    return true;
  }
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return false;
  }
  const type = getSemanticTypeForObjectShapeLookup(node, context);
  return isSourceDeclaredStructRuntimeCarrier(context.facts.get(type, runtimeCarrierFactKey)?.carrier) ||
    isSourceDeclaredStructRuntimeCarrier(context.facts.get(type?.symbol, runtimeCarrierFactKey)?.carrier);
}

function subjectReferencesSourceCoreStructMarkerDeclaration(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  return getSourceCoreStructMarkerDeclarationFromSubject(subject, context) !== undefined;
}

function isSourceDeclaredStructRuntimeCarrier(carrier: unknown): boolean {
  const type = carrier as CsharpTargetNamedTypeRef | undefined;
  return type?.kind === "target-named" && type.csharpSourceDeclarationKind === "struct";
}

function getSemanticTypeForObjectShapeLookup(
  node: Node,
  context: ExtensionObservationContext,
) {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  if (isTypeSyntaxNode(compiler.ast, node)) {
    try {
      return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
    } catch {
      return undefined;
    }
  }
  if (!isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)) {
    return undefined;
  }
  try {
    return compiler.checker.getTypeAtLocation(node, { sourceFile });
  } catch {
    return undefined;
  }
}
