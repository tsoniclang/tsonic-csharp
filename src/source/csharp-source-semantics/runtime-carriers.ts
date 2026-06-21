import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetTypeRef,
  Type,
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
  getStructuralChildNodes,
} from "./ast-utils.js";
import {
  csharpNativeProviderExtensionId,
  csharpTargetId,
} from "./identity.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  asType,
} from "./target-ref-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  createCsharpJsSurfaceHost,
  useObservationOrWhenDeferred,
} from "./operations-provider.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import type {
  CsharpLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  isRuntimeCarrierTypeSyntaxNode,
  getRuntimeCarrierSubjectSymbol,
  getRuntimeCarrierSubjectType,
} from "./runtime-carrier-subjects.js";
import {
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects,
  recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects,
} from "./runtime-carrier-object-shapes.js";

export {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
export type {
  CsharpLifecycleObservationContext,
} from "./runtime-carrier-context.js";
export {
  getRuntimeCarrierSubjectSymbol,
  getRuntimeCarrierSubjectType,
} from "./runtime-carrier-subjects.js";

export interface CsharpRuntimeCarrierSemanticsHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForSyntaxNode: (
    node: Node | undefined,
    facts: ExtensionFactStore,
    ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  ) => TargetTypeRef | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly getRecordedCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
}

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
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, sourceFile, true, targetId, selectedSurfaceIds, host);
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, sourceFile, false, targetId, selectedSurfaceIds, host);
  }
}

export function mapRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const primitive = (request.sourceTypeReference === undefined ? undefined : context.factResolver.resolve(request.sourceTypeReference, sourcePrimitiveFactKey)) ??
    (request.sourceTypeSymbol === undefined ? undefined : context.factResolver.resolve(request.sourceTypeSymbol, sourcePrimitiveFactKey)) ??
    context.factResolver.resolve(request.type, sourcePrimitiveFactKey);
  const syntaxCarrier = request.sourceTypeReference === undefined
    ? undefined
    : host.getTargetTypeRefForSubject(request.sourceTypeReference, context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false });
  if (syntaxCarrier !== undefined) {
    recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, syntaxCarrier, host);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: syntaxCarrier,
    }, [{ message: "C# runtime carrier mapped from source syntax/provider facts." }]);
  }
  if (primitive === undefined) {
    const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
      host.getRecordedCsharpObjectShapeFactForSubject(request.type, context);
    if (objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
      return acceptObservation<RuntimeCarrierFactResult>({
        carrier: objectShape.targetType,
      }, [{ message: "C# runtime carrier mapped from finalized structural object-shape facts." }]);
    }
    const carrier = host.getTargetTypeRefForType(asType(request.type), context, { allowRuntimeCarrier: false });
    return carrier === undefined
      ? deferObservation
      : acceptObservation<RuntimeCarrierFactResult>({
          carrier,
        }, [{ message: "C# runtime carrier mapped from checked TSTS type shape." }]);
  }
  return acceptObservation<RuntimeCarrierFactResult>({
    carrier: csharpSourcePrimitiveTargetType(primitive.kind),
  }, [{ message: "C# runtime carrier mapped from source primitive fact." }]);
}

function walkCsharpRuntimeCarrierFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node | undefined,
  typeSyntaxOnly: boolean,
  targetId: string,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  if (typeSyntaxOnly) {
    for (const child of getRuntimeCarrierChildNodes(compiler.ast, node)) {
      walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, child, typeSyntaxOnly, targetId, selectedSurfaceIds, host);
    }
    if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
      recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, selectedSurfaceIds, host);
    }
    return;
  }
  for (const child of getRuntimeCarrierChildNodes(compiler.ast, node)) {
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, child, typeSyntaxOnly, targetId, selectedSurfaceIds, host);
  }
  recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, node, selectedSurfaceIds, host);
  propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
}

function getRuntimeCarrierChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set([
    ...ast.children(node),
    ...ast.typeArguments(node),
    ...ast.typeParameters(node),
    ...ast.parameters(node),
    ...ast.members(node),
    ...ast.elements(node),
    ...ast.properties(node),
    ...ast.arguments(node),
    ...getStructuralChildNodes(node),
  ]));
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
  lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, result.evidence ?? []);
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, result.evidence ?? []);
  if (symbol !== undefined) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (type.symbol !== undefined) {
    lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
}

function recordCsharpRuntimeCarrierSyntaxFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  if (isObjectShapeRuntimeCarrierSyntaxNode(compiler.ast, node)) {
    const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
    const objectShape = host.getCsharpObjectShapeFactForSubject(node, context);
    if (objectShape !== undefined) {
      const evidence = [{ message: "C# runtime carrier recorded from finalized object-shape facts." }];
      lifecycleContext.host.facts.set(node, csharpObjectShapeFactKey, objectShape, evidence);
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, { carrier: objectShape.targetType }, evidence);
      return;
    }
  }
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, selectedSurfaceIds, host) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host);
  if (carrier === undefined) {
    return;
  }
  const fact = { carrier };
  const evidence = [{ message: "C# runtime carrier recorded from source syntax/provider facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
}

function isObjectShapeRuntimeCarrierSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) ||
    ast.is.IsTypeLiteralNode(node);
}

function getObservedRuntimeCarrierSyntaxTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsRegularExpressionLiteral(node)) {
    return undefined;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type: node,
    sourceTypeReference: node,
    target: csharpTargetId,
  }, selectedSurfaceIds, host);
  return result.kind === "accept" ? result.value.carrier : undefined;
}

function resolveCsharpRuntimeCarrierFromLifecycle(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  request: RuntimeCarrierFactRequest,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(csharpNativeProviderExtensionId, {
    getTargetTypeRefForSubject: host.getTargetTypeRefForSubject,
    getCsharpObjectShapeFactForSubject: host.getCsharpObjectShapeFactForSubject,
    mapRuntimeCarrier: (runtimeRequest, runtimeContext) => mapRuntimeCarrier(runtimeRequest, runtimeContext, host),
  }));
  return useObservationOrWhenDeferred(
    mapRuntimeCarrier(request, context, host),
    () => selectedSurfaceIds.has("js") ? jsSurface.mapRuntimeCarrier(request, context) : deferObservation,
  );
}

function getRuntimeCarrierSyntaxTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  if (!ast.is.IsNewExpression(node)) {
    return undefined;
  }
  const selected = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey);
  const declaringType = selected?.member.returnType ?? selected?.member.declaringType;
  if (declaringType?.kind !== "target-named") {
    return undefined;
  }
  const typeArguments = ast.typeArguments(node)
    .map((argument) => host.getTargetTypeRefForSyntaxNode(argument, lifecycleContext.host.facts, ast));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    ...declaringType,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
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
  const name = asNodeSubject(getNodeField(node, "Name"));
  const initializerFact = lifecycleContext.host.facts.get(initializer, runtimeCarrierFactKey);
  if (initializerFact === undefined) {
    return;
  }
  const evidence = [{ message: "C# runtime carrier propagated from checked initializer syntax." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, initializerFact, evidence);
  if (name !== undefined) {
    lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, initializerFact, evidence);
    const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, name);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, initializerFact, evidence);
    }
  }
}
