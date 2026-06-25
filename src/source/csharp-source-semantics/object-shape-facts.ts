import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getDeclarationTypeNode,
} from "./symbol-utils.js";
import {
  asType,
} from "./target-ref-utils.js";
import {
  deriveCsharpObjectShapeFactForSemanticSubject,
} from "./object-shape-semantic-facts.js";
import {
  deriveCsharpObjectShapeFactForSubject,
} from "./object-shape-type-literal-facts.js";
import {
  getRecordedCsharpObjectShapeFactForSubject,
  subjectHasSourceDeclaredStructRuntimeCarrier,
  subjectIsSourceCoreStructDeclarationPayload,
} from "./object-shape-recorded-facts.js";
import {
  getCsharpSourceStructDeclarationTargetForSubject,
} from "./source-declaration-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";

export {
  getTargetTypeRefForSyntaxNode,
  recordCsharpTypeParameterConstraintFactsBeforeFinalization,
} from "./object-shape-syntax-facts.js";
export type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
export {
  getRecordedCsharpObjectShapeFactForSubject,
} from "./object-shape-recorded-facts.js";
export {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic-facts.js";

export function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  const sourceDeclaredStruct = getCsharpSourceStructDeclarationTargetForSubject(subject, context, host);
  if (sourceDeclaredStruct !== undefined) {
    return sourceDeclaredStruct.objectShape;
  }
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (recorded !== undefined) {
    return recorded;
  }
  const derived = deriveCsharpObjectShapeFactForCanonicalSubject(subject, context, host);
  if (derived === undefined) {
    return undefined;
  }
  recordCsharpObjectShapeFactForSubject(subject, context, derived);
  return derived;
}

export function recordCsharpObjectShapeFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: "type.resolveRuntimeCarrier",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      getCsharpObjectShapeFactForSubject(node, context, host);
    });
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordObjectBindingMemberRuntimeCarriers(lifecycleContext, sourceFile, node, context, host);
    });
  }
}

function recordObjectBindingMemberRuntimeCarriers(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindVariableDeclaration") {
    return;
  }
  const pattern = asNodeSubject(getNodeField(node, "name"));
  if (pattern === undefined || compiler.ast.kindName(pattern) !== "KindObjectBindingPattern") {
    return;
  }
  const sourceExpression = asNodeSubject(getNodeField(node, "Initializer")) ??
    asNodeSubject(getNodeField(node, "Type"));
  const objectShape = getCsharpObjectShapeFactForSubject(sourceExpression, context, host);
  if (objectShape === undefined) {
    return;
  }
  const evidence = [{ message: "C# runtime carrier propagated from finalized object-shape destructuring member facts." }];
  for (const bindingElement of getNodeList(getNodeField(pattern, "Elements"))) {
    const bindingName = asNodeSubject(getNodeField(bindingElement, "name"));
    if (bindingName === undefined || compiler.ast.kindName(bindingName) !== "KindIdentifier") {
      continue;
    }
    const sourceName = getObjectBindingElementSourceName(compiler.ast, bindingElement);
    const member = sourceName === undefined
      ? undefined
      : objectShape.members.find((candidate) => candidate.sourceName === sourceName);
    if (member === undefined) {
      continue;
    }
    const fact = { carrier: member.type };
    lifecycleContext.host.facts.set(bindingElement, runtimeCarrierFactKey, fact, evidence);
    lifecycleContext.host.facts.set(bindingName, runtimeCarrierFactKey, fact, evidence);
    const symbol = getSafeObjectShapeSymbol(bindingName, sourceFile, context);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
    }
  }
}

function getObjectBindingElementSourceName(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  bindingElement: Node,
): string | undefined {
  const propertyName = asNodeSubject(getNodeField(bindingElement, "PropertyName")) ??
    asNodeSubject(getNodeField(bindingElement, "name"));
  if (propertyName === undefined) {
    return undefined;
  }
  const kind = ast.kindName(propertyName);
  return kind === "KindIdentifier" || kind === "KindStringLiteral"
    ? ast.text(propertyName)
    : undefined;
}

function deriveCsharpObjectShapeFactForCanonicalSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context)) {
    return undefined;
  }
  if (subjectIsSourceCoreStructDeclarationPayload(subject, context)) {
    return undefined;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context, host);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context, host);
}

function recordCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  fact: CsharpObjectShapeFact,
): void {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context) && !isSourceDeclaredStructObjectShapeFact(fact)) {
    return;
  }
  const evidence = [{ message: "C# object-shape fact recorded by canonical object-shape resolver." }];
  if (subject !== undefined) {
    context.facts.set(subject, csharpObjectShapeFactKey, fact, evidence);
  }
  for (const semanticSubject of getSemanticSubjects(subject, context)) {
    if (subjectHasSourceDeclaredStructRuntimeCarrier(semanticSubject, context) && !isSourceDeclaredStructObjectShapeFact(fact)) {
      continue;
    }
    context.facts.set(semanticSubject, csharpObjectShapeFactKey, fact, evidence);
  }
}

function isSourceDeclaredStructObjectShapeFact(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}

function getSemanticSubjects(
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

function getSafeObjectShapeSymbol(
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
