import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
  getNodeList,
  isSemanticTypeQueryableValueExpressionNode,
} from "./ast-utils.js";
import {
  getCallableExpressionTargetTypeRef,
  isCallableExpressionNode,
} from "./callable-target-types.js";
import type {
  CsharpLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  getRuntimeCarrierSubjectSymbol,
  getRuntimeCarrierSubjectType,
  isRuntimeCarrierTypeSyntaxNode,
} from "./runtime-carrier-subjects.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";
import {
  getObservedRuntimeCarrierSyntaxTargetTypeRef,
  getRuntimeCarrierSyntaxTargetTypeRef,
  resolveCsharpRuntimeCarrierFromLifecycle,
} from "./runtime-carrier-lifecycle-resolution.js";
import {
  getCatchVariableTargetTypeRef,
} from "./target-type-resolution-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "./target-ref-utils.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpNullableTargetType,
} from "./target-types.js";
import {
  getBinaryOperatorText,
} from "./operator-syntax.js";

export function recordCsharpRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: CsharpLifecycleObservationContext,
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    const nodes = collectRuntimeCarrierNodes(compiler.ast, sourceFile);
    for (const node of [...nodes].reverse()) {
      if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
        recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, host);
      }
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromDeclarationType(lifecycleContext, sourceFile, node, host);
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration(lifecycleContext, sourceFile, node, host);
    }
    for (const node of [...nodes].reverse()) {
      recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, sourceFile, node, host);
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromReferencedSymbol(lifecycleContext, sourceFile, node);
    }
    for (const node of nodes) {
      propagateCsharpExpectedRuntimeCarrierFactFromContext(lifecycleContext, sourceFile, node, host);
    }
  }
}

function collectRuntimeCarrierNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  seen: WeakSet<object> = new WeakSet(),
): readonly Node[] {
  if (seen.has(node)) {
    return [];
  }
  seen.add(node);
  const nodes: Node[] = [node];
  for (const child of getAstReaderChildNodes(ast, node)) {
    if (child !== undefined) {
      nodes.push(...collectRuntimeCarrierNodes(ast, child, seen));
    }
  }
  return nodes;
}

function recordCsharpRuntimeCarrierFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const type = getRuntimeCarrierSubjectType(compiler, sourceFile, node);
  if (type === undefined) {
    return;
  }
  const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, node);
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type,
    sourceTypeReference: node,
    ...(symbol !== undefined ? { sourceTypeSymbol: symbol } : {}),
    target: targetId,
  }, host);
  if (result.kind !== "accept") {
    return;
  }
  const fact = {
    carrier: result.value.carrier,
    ...(result.value.requiresAllocation !== undefined ? { requiresAllocation: result.value.requiresAllocation } : {}),
  };
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, result.evidence ?? []);
  if (runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(fact.carrier)) {
    lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (symbol !== undefined) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (type.symbol !== undefined && runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(fact.carrier)) {
    lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
}

function runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(type: TargetTypeRef): boolean {
  if (targetTypeRefContainsSourcePrimitive(type)) {
    return false;
  }
  return type.kind === "target-named" && (type.typeArguments?.length ?? 0) === 0;
}

function recordCsharpRuntimeCarrierSyntaxFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const catchVariableCarrier = getCatchVariableTargetTypeRef(node, context, host.getCatchExceptionTargetTypeRef?.());
  if (catchVariableCarrier !== undefined) {
    const fact = { carrier: catchVariableCarrier };
    const evidence = [{ message: "C# catch variable runtime carrier recorded from finalized provider exception policy." }];
    lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
    const sourceFile = compiler.ast.getSourceFile(node);
    const symbol = sourceFile === undefined
      ? undefined
      : getRuntimeCarrierSubjectSymbol(compiler, sourceFile, node);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
    }
    return;
  }
  if (isObjectShapeRuntimeCarrierSyntaxNode(compiler.ast, node)) {
    const objectShape = host.getCsharpObjectShapeFactForSubject(node, context);
    if (objectShape !== undefined) {
      const evidence = [{ message: "C# runtime carrier recorded from finalized object-shape facts." }];
      lifecycleContext.host.facts.set(node, csharpObjectShapeFactKey, objectShape, evidence);
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, { carrier: objectShape.targetType }, evidence);
      return;
    }
  }
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getCallableExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, node, host) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getUseSiteRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (carrier === undefined) {
    return;
  }
  const fact = { carrier };
  const evidence = [{ message: "C# runtime carrier recorded from source syntax/provider facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
}

function getUseSiteRuntimeCarrierTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const referenced = getReferencedRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node);
  const checked = getCheckedExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (referenced === undefined) {
    return checked;
  }
  if (checked === undefined) {
    return referenced;
  }
  return checkedRuntimeCarrierShouldOverrideReferencedCarrier(checked, referenced)
    ? checked
    : referenced;
}

function checkedRuntimeCarrierShouldOverrideReferencedCarrier(checked: TargetTypeRef, referenced: TargetTypeRef): boolean {
  if (isRuntimeUnionCarrier(referenced) && !isRuntimeUnionCarrier(checked)) {
    return true;
  }
  if (isSourceDeclarationCarrier(checked) && !isSourceDeclarationCarrier(referenced)) {
    return false;
  }
  return false;
}

function getReferencedRuntimeCarrierTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (
    compiler === undefined ||
    isRuntimeCarrierTypeSyntaxNode(compiler.ast, node) ||
    !isSemanticTypeQueryableValueExpressionNode(compiler.ast, node) ||
    !compiler.ast.is.IsIdentifier(node)
  ) {
    return undefined;
  }
  const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, node);
  const direct = getRuntimeCarrierTargetTypeRefForSymbolOrDeclaration(lifecycleContext, symbol);
  if (direct !== undefined) {
    return direct;
  }
  try {
    const resolved = compiler.checker.getResolvedSymbol(node, { sourceFile });
    return getRuntimeCarrierTargetTypeRefForSymbolOrDeclaration(lifecycleContext, resolved);
  } catch {
    return undefined;
  }
}

function getRuntimeCarrierTargetTypeRefForSymbolOrDeclaration(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  symbol: Symbol | undefined,
): TargetTypeRef | undefined {
  const direct = lifecycleContext.host.facts.get(symbol, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  for (const declaration of getSymbolDeclarations(symbol)) {
    const declarationFact = lifecycleContext.host.facts.get(declaration, runtimeCarrierFactKey)?.carrier;
    if (declarationFact !== undefined) {
      return declarationFact;
    }
    const nameFact = lifecycleContext.host.facts.get(asNodeSubject(getNodeField(declaration, "name")), runtimeCarrierFactKey)?.carrier;
    if (nameFact !== undefined) {
      return nameFact;
    }
  }
  return undefined;
}

function getCheckedExpressionRuntimeCarrierTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (
    compiler === undefined ||
    isRuntimeCarrierTypeSyntaxNode(compiler.ast, node) ||
    isControlFlowOnlyRuntimeCarrierSubject(compiler.ast, node) ||
    !isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
  ) {
    return undefined;
  }
  try {
    const type = getCheckedRuntimeCarrierType(compiler, node, sourceFile);
    const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
    const directCarrier = host.getTargetTypeRefForType(type, context, {
      allowRuntimeCarrier: false,
      sourceFile,
    });
    if (directCarrier !== undefined) {
      return directCarrier;
    }
    if (type === undefined) {
      return undefined;
    }
    if (compiler.types.isAny(type)) {
      const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
        type,
        sourceTypeReference: node,
        target: csharpTargetId,
      }, host);
      return result.kind === "accept" ? result.value.carrier : undefined;
    }
    if (!compiler.types.isUnion(type)) {
      return undefined;
    }
    const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
      type,
      sourceTypeReference: node,
      target: csharpTargetId,
    }, host);
    return result.kind === "accept" ? result.value.carrier : undefined;
  } catch {
    return undefined;
  }
}

function getCheckedRuntimeCarrierType(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  node: Node,
  sourceFile: SourceFile,
): Type | undefined {
  const typeReference = getContainingTypeReferenceNode(compiler.ast, node);
  if (typeReference !== undefined) {
    return compiler.checker.getTypeFromTypeNode(typeReference, { sourceFile });
  }
  return compiler.checker.getTypeAtLocation(node, { sourceFile });
}

function getContainingTypeReferenceNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): Node | undefined {
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsTypeReferenceNode(parent) &&
    asNodeSubject(getNodeField(parent, "TypeName")) === node
    ? parent
    : undefined;
}

function isControlFlowOnlyRuntimeCarrierSubject(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  switch (ast.kindName(node)) {
    case "KindSourceFile":
    case "KindVariableDeclaration":
    case "KindParameter":
    case "KindPropertyDeclaration":
    case "KindMethodDeclaration":
    case "KindFunctionDeclaration":
    case "KindClassDeclaration":
    case "KindInterfaceDeclaration":
    case "KindEnumDeclaration":
      return true;
    default:
      return false;
  }
}

function getCallableExpressionRuntimeCarrierTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  const sourceFile = compiler?.ast.getSourceFile(node);
  if (
    compiler === undefined ||
    sourceFile === undefined ||
    !isCallableExpressionNode(compiler.ast, node)
  ) {
    return undefined;
  }
  const type = getRuntimeCarrierSubjectType(compiler, sourceFile, node);
  if (type === undefined) {
    return undefined;
  }
  const checkedCallable = getCallableExpressionTargetTypeRef(
    node,
    type,
    sourceFile,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    host,
  );
  if (checkedCallable !== undefined) {
    return checkedCallable;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type,
    sourceTypeReference: node,
    target: csharpTargetId,
  }, host);
  return result.kind === "accept" ? result.value.carrier : undefined;
}

function isObjectShapeRuntimeCarrierSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) ||
    ast.is.IsTypeLiteralNode(node);
}

function propagateCsharpRuntimeCarrierFactFromVariableInitializer(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindVariableDeclaration") {
    return;
  }
  const initializer = asNodeSubject(getNodeField(node, "Initializer"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const initializerFact = lifecycleContext.host.facts.get(initializer, runtimeCarrierFactKey);
  if (initializerFact === undefined) {
    return;
  }
  const message = "C# runtime carrier propagated from checked initializer syntax.";
  setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, node, initializerFact, message);
  if (name !== undefined) {
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, name, initializerFact, message);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, symbol, initializerFact, message);
  }
}

function propagateCsharpRuntimeCarrierFactFromReferencedSymbol(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
): void {
  const carrier = getReferencedRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node);
  if (carrier === undefined) {
    return;
  }
  const existing = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey);
  if (existing !== undefined && !shouldReplaceUseSiteRuntimeCarrier(existing.carrier, carrier)) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
    carrier,
  }, [{ message: "C# runtime carrier propagated from finalized referenced declaration facts." }]);
}

function shouldReplaceUseSiteRuntimeCarrier(existing: TargetTypeRef, replacement: TargetTypeRef): boolean {
  if (isSourceDeclarationCarrier(existing) && !isSourceDeclarationCarrier(replacement)) {
    return true;
  }
  return false;
}

function isSourceDeclarationCarrier(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}

function isRuntimeUnionCarrier(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    ((type as { readonly csharpRuntimeUnionArms?: unknown }).csharpRuntimeUnionArms !== undefined ||
      type.id.startsWith("Tsonic.CSharp.Runtime.Union`"));
}

function propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const kind = compiler.ast.kindName(node);
  if (kind !== "KindVariableDeclaration" && kind !== "KindParameter") {
    return;
  }
  const pattern = asNodeSubject(getNodeField(node, "name"));
  if (pattern === undefined || compiler.ast.kindName(pattern) !== "KindObjectBindingPattern") {
    return;
  }
  const sourceExpression = kind === "KindVariableDeclaration"
    ? asNodeSubject(getNodeField(node, "Initializer"))
    : asNodeSubject(getNodeField(node, "Type"));
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const objectShape = host.getCsharpObjectShapeFactForSubject(sourceExpression, context);
  if (objectShape === undefined) {
    return;
  }
  for (const bindingElement of getNodeList(getNodeField(pattern, "Elements"))) {
    propagateCsharpRuntimeCarrierFactFromObjectBindingElement(lifecycleContext, sourceFile, bindingElement, objectShape);
  }
}

function propagateCsharpRuntimeCarrierFactFromObjectBindingElement(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  objectShape: NonNullable<ReturnType<CsharpRuntimeCarrierSemanticsHost["getCsharpObjectShapeFactForSubject"]>>,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindBindingElement") {
    return;
  }
  const bindingName = asNodeSubject(getNodeField(node, "name"));
  if (bindingName === undefined || compiler.ast.kindName(bindingName) !== "KindIdentifier") {
    return;
  }
  const sourceName = getObjectBindingElementSourceName(compiler.ast, node);
  const member = sourceName === undefined
    ? undefined
    : objectShape.members.find((candidate) => candidate.sourceName === sourceName);
  if (member === undefined) {
    return;
  }
  const fact = { carrier: member.type };
  const evidence = [{ message: "C# runtime carrier propagated from finalized object-shape destructuring member facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
  lifecycleContext.host.facts.set(bindingName, runtimeCarrierFactKey, fact, evidence);
  const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, bindingName);
  if (symbol !== undefined) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
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
  if (kind !== "KindIdentifier" && kind !== "KindStringLiteral") {
    return undefined;
  }
  return ast.text(propertyName);
}

function propagateCsharpRuntimeCarrierFactFromDeclarationType(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !isTypedRuntimeCarrierDeclaration(compiler.ast, node)) {
    return;
  }
  const typeNode = asNodeSubject(getNodeField(node, "Type"));
  const name = asNodeSubject(getNodeField(node, "name"));
  const resolvedTypeFact = lifecycleContext.host.facts.get(typeNode, runtimeCarrierFactKey) ??
    resolveDeclarationTypeRuntimeCarrierFact(lifecycleContext, typeNode, host);
  if (resolvedTypeFact === undefined) {
    return;
  }
  const typeFact = isOptionalParameterDeclaration(compiler.ast, node)
    ? { carrier: csharpNullableTargetType(resolvedTypeFact.carrier) }
    : resolvedTypeFact;
  const message = "C# runtime carrier propagated from checked declaration type annotation.";
  setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, node, typeFact, message);
  if (name !== undefined) {
    setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, name, typeFact, message);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    if (symbol !== undefined) {
      setRuntimeCarrierFactIfAbsentOrStronger(lifecycleContext, symbol, typeFact, message);
    }
  }
}

function propagateCsharpExpectedRuntimeCarrierFactFromContext(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const ast = compiler.ast;
  const kind = ast.kindName(node);
  if (kind === "KindReturnStatement") {
    const expression = asNodeSubject(getNodeField(node, "Expression"));
    const returnFact = getEnclosingReturnRuntimeCarrierFact(lifecycleContext, sourceFile, node, host);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, expression, returnFact, "C# expected runtime carrier propagated from source return type.");
    return;
  }
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    const initializer = asNodeSubject(getNodeField(node, "Initializer"));
    const declarationFact = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) ??
      lifecycleContext.host.facts.get(asNodeSubject(getNodeField(node, "Type")), runtimeCarrierFactKey);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, initializer, declarationFact, "C# expected runtime carrier propagated from source declaration type.");
    return;
  }
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    const leftFact = lifecycleContext.host.facts.get(asNodeSubject(getNodeField(node, "Left")), runtimeCarrierFactKey);
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Right")), leftFact, "C# expected runtime carrier propagated from assignment target.");
    return;
  }
  const nodeFact = lifecycleContext.host.facts.get(node, runtimeCarrierFactKey);
  if (nodeFact === undefined) {
    return;
  }
  if (kind === "KindConditionalExpression") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "WhenTrue")), nodeFact, "C# expected runtime carrier propagated into conditional true branch.");
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "WhenFalse")), nodeFact, "C# expected runtime carrier propagated into conditional false branch.");
    return;
  }
  if (kind === "KindParenthesizedExpression" || kind === "KindAsExpression" || kind === "KindSatisfiesExpression" || kind === "KindNonNullExpression" || kind === "KindTypeAssertionExpression") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Expression")), nodeFact, "C# expected runtime carrier propagated through transparent expression syntax.");
    return;
  }
  if (!ast.is.IsBinaryExpression(node)) {
    return;
  }
  const operator = getBinaryOperatorText(ast, node);
  if (operator === "??") {
    setRuntimeCarrierFactIfAbsent(lifecycleContext, asNodeSubject(getNodeField(node, "Right")), nodeFact, "C# expected runtime carrier propagated into nullish fallback.");
  }
}

function getEnclosingReturnRuntimeCarrierFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  returnStatement: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): { readonly carrier: TargetTypeRef } | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  let current = compiler.ast.parent(returnStatement);
  while (current !== undefined) {
    const kind = compiler.ast.kindName(current);
    if (
      kind === "KindFunctionDeclaration" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor"
    ) {
      const typeNode = asNodeSubject(getNodeField(current, "Type"));
      return lifecycleContext.host.facts.get(typeNode, runtimeCarrierFactKey) ??
        resolveDeclarationTypeRuntimeCarrierFact(lifecycleContext, typeNode, host);
    }
    current = compiler.ast.parent(current);
  }
  void sourceFile;
  return undefined;
}

function setRuntimeCarrierFactIfAbsent(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  node: Node | undefined,
  fact: { readonly carrier: TargetTypeRef } | undefined,
  message: string,
): void {
  if (node === undefined || fact === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, [{ message }]);
}

function setRuntimeCarrierFactIfAbsentOrStronger(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  subject: ExtensionFactSubject | undefined,
  fact: { readonly carrier: TargetTypeRef },
  message: string,
): void {
  if (subject === undefined) {
    return;
  }
  const existing = lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey);
  if (existing !== undefined && !shouldReplaceUseSiteRuntimeCarrier(existing.carrier, fact.carrier)) {
    return;
  }
  lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, fact, [{ message }]);
}

function isOptionalParameterDeclaration(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.kindName(node) === "KindParameter" &&
    asNodeSubject(getNodeField(node, "QuestionToken")) !== undefined;
}

function resolveDeclarationTypeRuntimeCarrierFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  typeNode: Node | undefined,
  host: CsharpRuntimeCarrierSemanticsHost,
): { readonly carrier: TargetTypeRef } | undefined {
  if (typeNode === undefined) {
    return undefined;
  }
  const carrier = host.getTargetTypeRefForSubject(
    typeNode,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    { allowRuntimeCarrier: false },
  );
  if (carrier === undefined) {
    return undefined;
  }
  const fact = { carrier };
  lifecycleContext.host.facts.set(typeNode, runtimeCarrierFactKey, fact, [{ message: "C# declaration runtime carrier resolved from source type annotation semantics." }]);
  return fact;
}

function isTypedRuntimeCarrierDeclaration(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  switch (ast.kindName(node)) {
    case "KindVariableDeclaration":
    case "KindParameter":
    case "KindPropertyDeclaration":
      return true;
    default:
      return false;
  }
}
