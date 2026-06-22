import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
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
  selectedSurfaceIds: ReadonlySet<string>,
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
        recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, selectedSurfaceIds, host);
      }
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromDeclarationType(lifecycleContext, sourceFile, node, host);
    }
    for (const node of [...nodes].reverse()) {
      recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, sourceFile, node, selectedSurfaceIds, host);
    }
    for (const node of [...nodes].reverse()) {
      propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
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
  selectedSurfaceIds: ReadonlySet<string>,
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
  }, selectedSurfaceIds, host);
  if (result.kind !== "accept") {
    return;
  }
  const fact = {
    carrier: result.value.carrier,
    ...(result.value.requiresAllocation !== undefined ? { requiresAllocation: result.value.requiresAllocation } : {}),
  };
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, result.evidence ?? []);
  if (!targetTypeRefContainsSourcePrimitive(fact.carrier)) {
    lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (symbol !== undefined) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (type.symbol !== undefined && !targetTypeRefContainsSourcePrimitive(fact.carrier)) {
    lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
}

function recordCsharpRuntimeCarrierSyntaxFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  selectedSurfaceIds: ReadonlySet<string>,
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
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, selectedSurfaceIds, host) ??
    getCallableExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, node, selectedSurfaceIds, host) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getReferencedRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node) ??
    getCheckedExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (carrier === undefined) {
    return;
  }
  const fact = { carrier };
  const evidence = [{ message: "C# runtime carrier recorded from source syntax/provider facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
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
  const direct = lifecycleContext.host.facts.get(symbol, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  try {
    const resolved = compiler.checker.getResolvedSymbol(node, { sourceFile });
    return lifecycleContext.host.facts.get(resolved, runtimeCarrierFactKey)?.carrier;
  } catch {
    return undefined;
  }
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
    return host.getTargetTypeRefForType(type, createRuntimeCarrierLifecycleObservationContext(lifecycleContext), {
      allowRuntimeCarrier: false,
      sourceFile,
    });
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
  selectedSurfaceIds: ReadonlySet<string>,
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
  }, selectedSurfaceIds, host);
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
  if (initializerFact === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const evidence = [{ message: "C# runtime carrier propagated from checked initializer syntax." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, initializerFact, evidence);
  if (name !== undefined && lifecycleContext.host.facts.get(name, runtimeCarrierFactKey) === undefined) {
    lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, initializerFact, evidence);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    if (symbol !== undefined && lifecycleContext.host.facts.get(symbol, runtimeCarrierFactKey) === undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, initializerFact, evidence);
    }
  }
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
  const evidence = [{ message: "C# runtime carrier propagated from checked declaration type annotation." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, typeFact, evidence);
  if (name !== undefined) {
    lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, typeFact, evidence);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, typeFact, evidence);
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
