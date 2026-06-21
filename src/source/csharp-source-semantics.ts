import {
  ExtensionLifecycleEvent,
  ExtensionObservationPoint,
  TstsProviderContractVersion,
  acceptObservation,
  attributeFactKey,
  contextualTargetTypeFactKey,
  createSourceSemanticsExtension,
  deferObservation,
  functionPointerFactKey,
  pointerFactKey,
  providerVirtualDeclarationFactKey,
  rejectObservation,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedConversionMappingRequest,
  CheckedConversionMappingResult,
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  CheckedPropertyAccessMappingRequest,
  CompilerExtension,
  ContextualTargetTypeRequest,
  ContextualTargetTypeResult,
  ExtensionObservation,
  ExtensionObservationContext,
  ExtensionFactStore,
  ExtensionFactSubject,
  Node,
  ProviderVirtualDeclarationFact,
  ProviderIdentity,
  ParameterPassingRequest,
  ParameterPassingResult,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  BeforeSemanticsFinalizedLifecycleRequest,
  SourceFileBoundLifecycleRequest,
  SourcePrimitiveKind,
  TargetBindingFact,
  TargetConstraint,
  TargetMember,
  TargetParameter,
  TargetSemanticProvider,
  TargetTypeRef,
  Type,
  Symbol,
} from "@tsonic/tsts";
import type { TargetProviderContext } from "@tsonic/target-api";
import {
  csharpObjectShapeFactKey,
  csharpTargetIterationFactKey,
  csharpTargetTypeParameterConstraintFactKey,
} from "./csharp-facts.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpTargetIterationFact,
} from "./csharp-facts.js";
import { csharpProviderDiagnostic } from "./csharp-source-semantics/diagnostics.js";
import { createCsharpCoreVirtualModulesProvider } from "./csharp-source-semantics/core-virtual-modules.js";
import {
  csharpLangModule,
  csharpNativeProviderExtensionId,
  csharpProviderVersion,
  csharpTargetId,
  neutralLangModule,
} from "./csharp-source-semantics/identity.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./csharp-source-semantics/target-types.js";
import { csharpSourceSemanticsModules } from "./csharp-source-semantics/source-modules.js";
import {
  findTargetBinding,
  getKnownTargetBindingForTypeRef,
  resolveTargetBinding,
} from "./csharp-source-semantics/provider-bindings.js";
import {
  createCsharpJsSurfaceMappers,
} from "./csharp-source-semantics/surfaces/js/index.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
  createCsharpNodejsSurfaceMappers,
} from "./csharp-source-semantics/surfaces/nodejs/index.js";
import {
  createCsharpDotnetSystemTypeDataProvider,
  createDotnetTargetBindingProvider,
} from "../providers/dotnet/index.js";

export {
  csharpLangModule,
  csharpTypesModule,
  neutralLangModule,
  neutralTypesModule,
} from "./csharp-source-semantics/identity.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;
const checkedOperationNodeFallbackQuery = { allowSemanticTypeQuery: false } satisfies TargetTypeRefResolutionOptions;

interface TargetTypeRefResolutionOptions {
  readonly allowRuntimeCarrier?: boolean;
  readonly allowSemanticTypeQuery?: boolean;
  readonly sourceFile?: SourceFile;
}

export function createCsharpSourceSemanticsExtension(_context: TargetProviderContext): CompilerExtension {
  return createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
}

export function createCsharpNativeProviderExtension(context: TargetProviderContext): CompilerExtension {
  const selectedSurfaceIds = new Set(context.selectedSurfaces.map((surface) => surface.id));
  return {
    identity: {
      id: csharpNativeProviderExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.native",
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
      context.registerTargetBindingProvider(createDotnetTargetBindingProvider({
        provider: createCsharpDotnetSystemTypeDataProvider(),
      }));
      if (selectedSurfaceIds.has("nodejs")) {
        context.registerTargetBindingProvider(createCsharpNodejsSurfaceBindingProvider());
      }
      const provider = createCsharpOperationsProvider(selectedSurfaceIds);
      context.registerTargetSemanticProvider(provider);
      context.registerLifecycleHook<SourceFileBoundLifecycleRequest>(ExtensionLifecycleEvent.afterSourceFileBound, (request, lifecycleContext) => {
        recordCsharpSourceFileFacts(request, context.facts, lifecycleContext.compiler?.ast);
      });
      context.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext);
        recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(lifecycleContext);
        recordCsharpCheckedOperatorFactsBeforeFinalization(lifecycleContext);
        recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, selectedSurfaceIds);
      });
      context.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) => {
        const primitive = resolverContext.facts.get(subject, sourcePrimitiveFactKey);
        return primitive === undefined
          ? undefined
          : {
              value: {
                carrier: csharpSourcePrimitiveTargetType(primitive.kind),
              },
              evidence: [{ message: "C# primitive carrier resolved from finalized source primitive fact." }],
            };
      });
    },
  };
}

function recordCsharpRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: Parameters<NonNullable<CompilerExtension["initialize"]>>[0] extends never ? never : { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  targetId: string,
  selectedSurfaceIds: ReadonlySet<string>,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, sourceFile, true, targetId, selectedSurfaceIds);
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, sourceFile, false, targetId, selectedSurfaceIds);
  }
}

function recordCsharpObjectRestBindingFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitStructuralNodes(sourceFile, (node) => {
      if (!isObjectRestBindingElement(node, compiler.ast)) {
        return;
      }
      const restName = asNodeSubject(getNodeField(node, "Name") ?? getNodeField(node, "name"));
      const sourceExpression = getObjectBindingPatternSourceExpression(node);
      if (restName === undefined || sourceExpression === undefined) {
        return;
      }
      const sourceShape = getCsharpObjectShapeFactForSubject(sourceExpression, context);
      if (sourceShape === undefined) {
        return;
      }
      const omitted = getObjectBindingPatternOmittedNames(node, compiler.ast);
      const members = sourceShape.members.filter((member) => !omitted.has(member.sourceName));
      if (members.length === sourceShape.members.length || members.length === 0) {
        return;
      }
      const restShape = {
        targetType: csharpTargetNamedType(getObjectShapeTargetName("__TsonicShape", members)),
        members,
      } satisfies CsharpObjectShapeFact;
      recordCsharpObjectRestBindingFact(lifecycleContext, sourceFile, [node, restName], restShape);
    });
  }
}

function isObjectRestBindingElement(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  return ast.kindName(node) === "KindBindingElement" &&
    getNodeField(node, "DotDotDotToken") !== undefined &&
    ast.kindName(getNodeField(node, "Parent") as Node | undefined) === "KindObjectBindingPattern";
}

function getObjectBindingPatternSourceExpression(restBindingElement: Node): Node | undefined {
  const bindingPattern = asNodeSubject(getNodeField(restBindingElement, "Parent"));
  const bindingOwner = asNodeSubject(getNodeField(bindingPattern, "Parent"));
  if (bindingOwner === undefined) {
    return undefined;
  }
  return asNodeSubject(getNodeField(bindingOwner, "Initializer")) ??
    asNodeSubject(getNodeField(bindingOwner, "Type"));
}

function getObjectBindingPatternOmittedNames(
  restBindingElement: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): ReadonlySet<string> {
  const bindingPattern = asNodeSubject(getNodeField(restBindingElement, "Parent"));
  const omitted = new Set<string>();
  for (const element of getNodeList(getNodeField(bindingPattern, "Elements"))) {
    if (element === restBindingElement || getNodeField(element, "DotDotDotToken") !== undefined) {
      continue;
    }
    const sourceName = getObjectBindingElementSourceName(element, ast);
    if (sourceName.length > 0) {
      omitted.add(sourceName);
    }
  }
  return omitted;
}

function getObjectBindingElementSourceName(
  bindingElement: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string {
  const propertyName = asNodeSubject(getNodeField(bindingElement, "PropertyName"));
  const sourceNameNode = propertyName ?? asNodeSubject(getNodeField(bindingElement, "Name") ?? getNodeField(bindingElement, "name"));
  return getSourceNameNodeText(sourceNameNode, ast);
}

function getSourceNameNodeText(
  node: Node | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string {
  if (node === undefined) {
    return "";
  }
  if (ast.is.IsIdentifier(node) || ast.is.IsStringLiteral(node)) {
    return ast.text(node);
  }
  return "";
}

function recordCsharpObjectRestBindingFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  subjects: readonly Node[],
  restShape: CsharpObjectShapeFact,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const runtimeCarrier = { carrier: restShape.targetType };
  const evidence = [{ message: "C# object rest binding shape recorded from finalized source object-shape facts." }];
  for (const subject of subjects) {
    lifecycleContext.host.facts.set(subject, csharpObjectShapeFactKey, restShape, evidence);
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, runtimeCarrier, evidence);
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, subject, sourceFile);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
    }
    const type = getRuntimeCarrierSubjectType(compiler, sourceFile, subject);
    if (type !== undefined) {
      lifecycleContext.host.facts.set(type, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, runtimeCarrier, evidence);
      if (type.symbol !== undefined) {
        lifecycleContext.host.facts.set(type.symbol, csharpObjectShapeFactKey, restShape, evidence);
        lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
      }
    }
  }
}

function recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitStructuralNodes(sourceFile, (node) => {
      if (!compiler.ast.is.IsPropertyAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const receiver = asNodeSubject(getNodeField(node, "Expression"));
      const propertyName = getSourceNameNodeText(asNodeSubject(getNodeField(node, "Name") ?? getNodeField(node, "name")), compiler.ast);
      if (receiver === undefined || propertyName.length === 0) {
        return;
      }
      const objectShape = getRecordedCsharpObjectShapeFactForSubject(receiver, context) ??
        getRecordedCsharpObjectShapeFactForSubject(getSymbolForDeclarationLookup(compiler.ast, compiler.checker, receiver, sourceFile), context);
      const member = objectShape?.members.find((candidate) => candidate.sourceName === propertyName);
      if (objectShape === undefined || member === undefined) {
        return;
      }
      lifecycleContext.host.facts.set(node, targetOperationFactKey, targetOperation(
        `tsonic.csharp.objectShape.${propertyName}`,
        member.memberKind === "method" ? "method" : "property",
        member.targetName,
        { resultType: member.type },
      ), [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
    });
  }
}

function recordCsharpCheckedOperatorFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitStructuralNodes(sourceFile, (node) => {
      if (lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const operation = getCsharpCheckedOperatorFactFromSyntax(node, context);
      if (operation !== undefined) {
        lifecycleContext.host.facts.set(node, targetOperationFactKey, operation, [{ message: "C# checked operator fact finalized from deterministic target operand facts." }]);
      }
    });
  }
}

function getCsharpCheckedOperatorFactFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
): CheckedOperationMappingResult["operation"] | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const operator = ast.is.IsBinaryExpression(node)
    ? getBinaryOperatorText(ast, node)
    : ast.kindName(node) === "KindPrefixUnaryExpression"
      ? getPrefixUnaryOperatorText(ast, node)
      : undefined;
  const targetOperator = operator === undefined ? undefined : getCsharpOperatorTargetOperation(operator);
  if (operator === undefined || targetOperator === undefined) {
    return undefined;
  }
  const leftSubject = ast.is.IsBinaryExpression(node)
    ? asNodeSubject(getNodeField(node, "Left"))
    : asNodeSubject(getNodeField(node, "Operand"));
  const rightSubject = ast.is.IsBinaryExpression(node)
    ? asNodeSubject(getNodeField(node, "Right"))
    : undefined;
  const operandQuery = getCheckedOperatorOperandQuery(operator);
  const left = getTargetTypeRefForSubject(leftSubject, context, operandQuery);
  const right = getTargetTypeRefForSubject(rightSubject, context, operandQuery) ??
    getLiteralTargetTypeRefForKnownOperatorOperand(left, rightSubject, context);
  if (left === undefined || (rightSubject !== undefined && right === undefined)) {
    return undefined;
  }
  if (left.kind === "type-parameter" || right?.kind === "type-parameter") {
    return undefined;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left)) {
    return undefined;
  }
  return targetOperation(
    `tsonic.csharp.operator.${targetOperator}`,
    "operator",
    targetOperator,
    { resultType: getCsharpOperatorResultTypeRefForOperator(operator, left, right) },
  );
}

function walkCsharpRuntimeCarrierFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node | undefined,
  typeSyntaxOnly: boolean,
  targetId: string,
  selectedSurfaceIds: ReadonlySet<string>,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  if (typeSyntaxOnly) {
    for (const child of getRuntimeCarrierChildNodes(compiler.ast, node)) {
      walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, child, typeSyntaxOnly, targetId, selectedSurfaceIds);
    }
    if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
      recordCsharpRuntimeCarrierFact(lifecycleContext, sourceFile, node, targetId, selectedSurfaceIds);
    }
    return;
  }
  for (const child of getRuntimeCarrierChildNodes(compiler.ast, node)) {
    walkCsharpRuntimeCarrierFacts(lifecycleContext, sourceFile, child, typeSyntaxOnly, targetId, selectedSurfaceIds);
  }
  recordCsharpRuntimeCarrierSyntaxFact(lifecycleContext, node, selectedSurfaceIds);
  propagateCsharpRuntimeCarrierFactFromVariableInitializer(lifecycleContext, sourceFile, node);
}

function getRuntimeCarrierChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set([
    ...safeAstChildNodes(() => ast.children(node)),
    ...safeAstChildNodes(() => ast.typeArguments(node)),
    ...safeAstChildNodes(() => ast.typeParameters(node)),
    ...safeAstChildNodes(() => ast.parameters(node)),
    ...safeAstChildNodes(() => ast.members(node)),
    ...safeAstChildNodes(() => ast.elements(node)),
    ...safeAstChildNodes(() => ast.properties(node)),
    ...safeAstChildNodes(() => ast.arguments(node)),
    ...getStructuralChildNodes(node),
  ]));
}

function safeAstChildNodes(read: () => readonly (Node | undefined)[]): readonly (Node | undefined)[] {
  try {
    return read();
  } catch {
    return [];
  }
}

function recordCsharpRuntimeCarrierFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  targetId: string,
  selectedSurfaceIds: ReadonlySet<string>,
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
  }, selectedSurfaceIds);
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
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  if (isObjectShapeRuntimeCarrierSyntaxNode(compiler.ast, node)) {
    const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
    const objectShape = getCsharpObjectShapeFactForSubject(node, context);
    if (objectShape !== undefined) {
      const evidence = [{ message: "C# runtime carrier recorded from finalized object-shape facts." }];
      lifecycleContext.host.facts.set(node, csharpObjectShapeFactKey, objectShape, evidence);
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, { carrier: objectShape.targetType }, evidence);
      return;
    }
  }
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, selectedSurfaceIds) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node);
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
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsRegularExpressionLiteral(node)) {
    return undefined;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type: node,
    sourceTypeReference: node,
    target: csharpTargetId,
  }, selectedSurfaceIds);
  return result.kind === "accept" ? result.value.carrier : undefined;
}

function resolveCsharpRuntimeCarrierFromLifecycle(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  request: RuntimeCarrierFactRequest,
  selectedSurfaceIds: ReadonlySet<string>,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(csharpNativeProviderExtensionId));
  return useObservationOrWhenDeferred(
    mapRuntimeCarrier(request, context),
    () => selectedSurfaceIds.has("js") ? jsSurface.mapRuntimeCarrier(request, context) : deferObservation,
  );
}

function createRuntimeCarrierLifecycleObservationContext(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): ExtensionObservationContext<typeof ExtensionObservationPoint.resolveRuntimeCarrier> {
  return {
    observation: ExtensionObservationPoint.resolveRuntimeCarrier,
    extensionId: csharpNativeProviderExtensionId,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    ...(lifecycleContext.compiler !== undefined ? { compiler: lifecycleContext.compiler } : {}),
  };
}

function getRuntimeCarrierSyntaxTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
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
    .map((argument) => getTargetTypeRefForSyntaxNode(argument, lifecycleContext.host.facts, ast));
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

function isRuntimeCarrierTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return isTypeSyntaxNode(ast, node);
}

function getRuntimeCarrierSubjectType(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Type | undefined {
  try {
    return isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)
      ? compiler.checker.getTypeFromTypeNode(node, { sourceFile }) ?? compiler.checker.getTypeAtLocation(node, { sourceFile })
      : compiler.checker.getTypeAtLocation(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function getRuntimeCarrierSubjectSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Symbol | undefined {
  try {
    return compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
      compiler.checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function createCsharpOperationsProvider(selectedSurfaceIds: ReadonlySet<string>): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  const jsSurfaceEnabled = selectedSurfaceIds.has("js");
  const nodejsSurfaceEnabled = selectedSurfaceIds.has("nodejs");
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(identity.id));
  const nodejsSurface = createCsharpNodejsSurfaceMappers(identity.id);
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return useObservationOrWhenDeferred(
        mapRuntimeCarrier(request, context),
        () => jsSurfaceEnabled ? jsSurface.mapRuntimeCarrier(request, context) : deferObservation,
      );
    },
    mapCheckedCall(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedCall(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedCall(request, context, identity.id),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedCall(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedPropertyAccess(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedPropertyAccess(request, context, identity.id),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedElementAccess(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpCheckedElementAccess(request, context, identity.id),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedElementAccess(request, context) : deferObservation,
      );
    },
    mapCheckedOperator(request, context) {
      return mapCsharpCheckedOperator(request, context, identity.id);
    },
    mapCheckedIteration(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpNativeCheckedIteration(request, context),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedIteration(request, context) : deferObservation,
      );
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context);
    },
    resolveParameterPassing(request, context) {
      return mapCsharpParameterPassing(request, context);
    },
  };
}

function createCsharpJsSurfaceHost(extensionId: string) {
  return {
    targetId: csharpTargetId,
    extensionId,
    getTargetTypeRefForSubject,
    unwrapNullableTargetType,
    isCsharpStringType,
    isIntegralTargetTypeRef,
    scoreLiteralTargetTypeMatch,
    selectTargetMember,
    getCsharpObjectShapeFactForSubject,
    csharpProviderDiagnostic,
  };
}

function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}

function mapCsharpCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
): ExtensionObservation<CheckedCallMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  if (isCheckedAttributeBuilderCall(request, context)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(undefined, request) },
    }, [{ message: "C# attribute builder marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const virtualDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  if (isErasedSourceSemanticsCall(virtualDeclaration)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(virtualDeclaration, request) },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedContainerSymbol,
    request.sourceSelectedDeclarationContainer,
    request.calleeAliasedSymbol,
    request.calleeResolvedSymbol,
    request.calleeSymbol,
    request.callee,
    request.calleeReceiverTypeSymbol,
    request.calleeReceiverType,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
  ]) ?? getKnownTargetBindingForTypeRef(
    getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
      getTargetTypeRefForSubject(request.calleeReceiver, context, checkedOperationNodeFallbackQuery),
  );
  if (binding === undefined) {
    return deferObservation;
  }
  const member = findTargetMemberForCall(
    binding,
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey),
    request.calleePropertyName,
    request,
    context,
  );
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_FOUND", 9100100, `C# provider could not map checked call '${request.calleePropertyName ?? "<anonymous>"}' on target '${binding.id}'.`));
  }
  if (member.kind !== "method" && member.kind !== "constructor") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_CALLABLE", 9100101, `C# provider mapped checked call '${request.calleePropertyName ?? "<anonymous>"}' to non-callable target member '${member.id}'.`));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function isErasedSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== neutralLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "attribute" ||
    declaration.exportName === "field" ||
    declaration.exportName === "struct" ||
    declaration.exportName === "defaultof" ||
    declaration.exportName === "out" ||
    declaration.exportName === "ref" ||
    declaration.exportName === "inref" ||
    declaration.exportName === "borrow" ||
    declaration.exportName === "borrowMut" ||
    declaration.exportName === "move" ||
    declaration.exportName === "__TsonicAttributeBuilder" ||
    declaration.exportName === "__TsonicAttributeMemberBuilder";
}

function isCheckedAttributeBuilderCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.facts.get(request.call, attributeFactKey) !== undefined ||
    context.facts.get(request.calleeReceiver, attributeFactKey) !== undefined;
}

function erasedSourceSemanticsMember(
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
): TargetMember {
  const sourceName = declaration?.memberName ?? declaration?.exportName ?? request.calleePropertyName ?? "sourceMarker";
  return {
    id: declaration?.signatureId ?? `${declaration?.providerModuleId ?? "source-semantics"}.${sourceName}`,
    sourceName,
    targetName: "__tsonic_erased_source_marker",
    kind: "method",
    parameters: [],
  };
}

function mapCsharpCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedContainerSymbol,
    request.sourceSelectedDeclarationContainer,
    request.sourceSelectedDeclaration,
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiverAliasedSymbol,
    request.receiverResolvedSymbol,
    request.receiverSymbol,
  ]) ?? getKnownTargetBindingForTypeRef(
    getTargetTypeRefForSubject(request.receiverType, context) ??
      getTargetTypeRefForSubject(request.receiver, context, checkedOperationNodeFallbackQuery),
  );
  if (binding === undefined) {
    const arrayOperation = mapCsharpNativeArrayCheckedPropertyAccess(request, context);
    if (arrayOperation !== undefined) {
      return arrayOperation;
    }
    return mapCsharpObjectShapeCheckedPropertyAccess(request, context) ?? deferObservation;
  }
  const member = findTargetMember(binding, context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey), request.propertyName);
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_FOUND", 9100102, `C# provider could not map checked property '${request.propertyName}' on target '${binding.id}'.`));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# target property/member access selected from checked TSTS provider declaration." }]);
}

function mapCsharpObjectShapeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const objectShape = getCsharpObjectShapeFactForSubject(request.receiver, context) ??
    getCsharpObjectShapeFactForSubject(request.receiverType, context) ??
    getCsharpObjectShapeFactForSubject(request.receiverSymbol, context) ??
    getCsharpObjectShapeFactForSubject(request.receiverResolvedSymbol, context) ??
    getCsharpObjectShapeFactForSubject(request.receiverAliasedSymbol, context);
  if (objectShape === undefined) {
    return undefined;
  }
  const member = objectShape.members.find((candidate) => candidate.sourceName === request.propertyName);
  if (member === undefined) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      `tsonic.csharp.objectShape.${request.propertyName}`,
      member.memberKind === "method" ? "method" : "property",
      member.targetName,
      { resultType: member.type },
    ),
  }, [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
}

function mapCsharpCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const binding = findTargetBinding(context, [
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiver,
  ]) ?? getKnownTargetBindingForTypeRef(
    getTargetTypeRefForSubject(request.receiverType, context) ??
      getTargetTypeRefForSubject(request.receiver, context, checkedOperationNodeFallbackQuery),
  );
  if (binding === undefined) {
    return mapCsharpNativeArrayCheckedElementAccess(request, context, extensionId) ?? deferObservation;
  }
  const indexers = (binding.members ?? []).filter((member) => member.kind === "indexer");
  const member = indexers.length === 1 ? indexers[0] : undefined;
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider could not map checked element access on target '${binding.id}' to a unique indexer.`));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# target indexer access selected from checked TSTS provider declaration." }]);
}

function mapCsharpNativeArrayCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.propertyName !== "length") {
    return undefined;
  }
  const receiverType = unwrapNullableTargetType(
    getTargetTypeRefForSubject(request.receiverType, context, noRuntimeCarrierQuery) ??
      getTargetTypeRefForSubject(request.receiver, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }),
  );
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.array.length", "property", "Length", {
      resultType: csharpSourcePrimitiveTargetType("int32"),
    }),
  }, [{ message: "C# native array length selected from checked TypeScript array property access." }]);
}

function mapCsharpNativeArrayCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = unwrapNullableTargetType(
    getTargetTypeRefForSubject(request.receiverType, context, noRuntimeCarrierQuery) ??
      getTargetTypeRefForSubject(request.receiver, context, { ...noRuntimeCarrierQuery, allowSemanticTypeQuery: false }),
  );
  if (receiverType?.kind !== "array") {
    return undefined;
  }
  const indexType = getTargetTypeRefForSubject(request.argument, context);
  if (!isIntegralTargetTypeRef(indexType) && scoreLiteralTargetTypeMatch(csharpSourcePrimitiveTargetType("int32"), request.argument, context) === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100109, "C# native array element access requires an integral TSTS/provider-backed index type."));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.array.indexer", "indexer", "System.Array.Item", {
      resultType: receiverType.element,
    }),
  }, [{ message: "C# native array indexer selected from checked TypeScript element access." }]);
}

function mapCsharpCheckedOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  _extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const typeofComparison = getTypeofComparisonOperation(request, context);
  if (typeofComparison !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: typeofComparison,
    }, [{ message: "C# typeof comparison selected from checked TSTS operator result." }]);
  }
  if (request.operator === "typeof") {
    const operandType = getTargetTypeRefForSubject(request.leftType, context, noRuntimeCarrierQuery) ??
      getTargetTypeRefForSubject(request.left, context, noRuntimeCarrierQuery);
    const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
    if (runtimeKind === undefined) {
      return deferObservation;
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(`tsonic.csharp.typeof.${runtimeKind}`, "operator", `typeof:${runtimeKind}`),
    }, [{ message: "C# typeof runtime kind selected from checked TSTS operand type." }]);
  }
  if (request.operator === "instanceof") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.instanceof", "operator", "is"),
    }, [{ message: "C# type-test operation selected from checked TSTS instanceof expression." }]);
  }
  const targetOperator = getCsharpOperatorTargetOperation(request.operator);
  if (targetOperator === undefined) {
    return deferObservation;
  }
  const operandQuery = getCheckedOperatorOperandQuery(request.operator);
  const left = getTargetTypeRefForSubject(request.leftType, context) ??
    getTargetTypeRefForSubject(request.left, context, operandQuery);
  const right = getTargetTypeRefForSubject(request.rightType, context) ??
    getTargetTypeRefForSubject(request.right, context, operandQuery) ??
    getLiteralTargetTypeRefForKnownOperatorOperand(left, request.right, context);
  if (left === undefined || (request.right !== undefined && right === undefined)) {
    return deferObservation;
  }
  if (left.kind === "type-parameter" || right?.kind === "type-parameter") {
    return deferObservation;
  }
  if (isCsharpBitwiseOperator(request.operator) && !isIntegralTargetTypeRef(left)) {
    return deferObservation;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      `tsonic.csharp.operator.${targetOperator}`,
      "operator",
      targetOperator,
      { resultType: getCsharpOperatorResultTypeRef(request, left, right) },
    ),
  }, [{ message: "C# source operator selected after TSTS accepted the operation." }]);
}

function getCsharpOperatorResultTypeRef(
  request: CheckedOperatorMappingRequest,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  return getCsharpOperatorResultTypeRefForOperator(request.operator, left, right);
}

function getCsharpOperatorResultTypeRefForOperator(
  operator: string,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
): TargetTypeRef {
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case "typeof":
      return csharpTargetNamedType("System.String");
    case "??":
      return unwrapNullableTargetType(left) ?? right ?? left;
    default:
      return left;
  }
}

function getCheckedOperatorOperandQuery(operator: string): TargetTypeRefResolutionOptions {
  return operator === "??" ? {} : checkedOperationNodeFallbackQuery;
}

function getLiteralTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const unwrappedExpected = unwrapNullableTargetType(expectedOperandType);
  return unwrappedExpected !== undefined && scoreLiteralTargetTypeMatch(unwrappedExpected, operand, context) !== undefined
    ? unwrappedExpected
    : undefined;
}

function mapCsharpNativeCheckedIteration(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const expressionType = getTargetTypeRefForSubject(request.sourceExpressionType, context, noRuntimeCarrierQuery);
  if (request.kind === "for-of") {
    if (expressionType?.kind === "array") {
      const fact = {
        operationId: "tsonic.csharp.array.foreach",
        iterationKind: "sync",
        targetOperation: "ForEachStatement",
        elementType: expressionType.element,
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# array for-of maps to foreach." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.targetOperation),
      }, [{ message: "C# array iteration fact recorded after TSTS accepted for-of." }]);
    }
    return deferObservation;
  }
  return deferObservation;
}

function mapCsharpContextualTargetType(
  request: ContextualTargetTypeRequest,
  _context: ExtensionObservationContext<"type.recordContextualTargetType">,
): ExtensionObservation<ContextualTargetTypeResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  return acceptObservation<ContextualTargetTypeResult>({
    type: request.context,
  }, [{ message: "C# contextual target type recorded from checked TSTS contextual type." }]);
}

function mapCsharpCheckedConversion(
  request: CheckedConversionMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedConversion">,
): ExtensionObservation<CheckedConversionMappingResult> {
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const source = getTargetTypeRefForSubject(request.source, context);
  const target = getTargetTypeRefForSubject(request.target, context);
  if (target === undefined) {
    return deferObservation;
  }
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# argument already has the selected target type." }]);
  }
  if (scoreLiteralTargetTypeMatch(target, request.source, context) !== undefined) {
    return acceptObservation<CheckedConversionMappingResult>({
      convertedType: target,
    }, [{ message: "C# literal argument is statically representable as the selected target type." }]);
  }
  const operation = getCsharpConversionOperation(source, target);
  return acceptObservation<CheckedConversionMappingResult>({
    convertedType: target,
    ...(operation !== undefined ? { operation } : {}),
  }, [{ message: "C# target conversion recorded from checked call argument and selected target parameter." }]);
}

function mapCsharpParameterPassing(
  request: ParameterPassingRequest,
  _context: ExtensionObservationContext<"parameter.resolvePassing">,
): ExtensionObservation<ParameterPassingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const parameter = asTargetParameter(request.parameter);
  if (parameter === undefined) {
    return deferObservation;
  }
  return acceptObservation<ParameterPassingResult>({
    passing: {
      mode: parameter.passingMode,
      ...(request.argument !== undefined ? { targetExpression: request.argument } : {}),
    },
  }, [{ message: "C# argument passing recorded from selected target parameter." }]);
}

function targetOperation(
  operationId: string,
  operationKind: "property" | "method" | "indexer" | "operator" | "constructor" | "iteration",
  targetOperation: string,
  options: { readonly resultType?: ExtensionFactSubject } = {},
) {
  return {
    operationId,
    operationKind,
    targetOperation,
    ...(options.resultType !== undefined ? { resultType: options.resultType } : {}),
  };
}

function getTypeofComparisonOperation(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext,
) {
  if (request.operator !== "===" && request.operator !== "==" && request.operator !== "!==" && request.operator !== "!=") {
    return undefined;
  }
  const leftKind = getTypeofLiteralComparisonKind(request.left, request.right, context);
  const rightKind = leftKind ?? getTypeofLiteralComparisonKind(request.right, request.left, context);
  if (rightKind === undefined) {
    return undefined;
  }
  const negated = request.operator === "!==" || request.operator === "!=";
  return targetOperation(
    `tsonic.csharp.typeof.${negated ? "not-" : ""}${rightKind}`,
    "operator",
    `${negated ? "typeof-is-not" : "typeof-is"}:${rightKind}`,
  );
}

function getTypeofLiteralComparisonKind(
  typeofExpression: ExtensionFactSubject | undefined,
  literal: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): "string" | "number" | "boolean" | "bigint" | undefined {
  const ast = context.compiler?.ast;
  const expressionNode = asNodeSubject(typeofExpression);
  const literalNode = asNodeSubject(literal);
  if (ast === undefined || expressionNode === undefined || literalNode === undefined || !ast.is.IsTypeOfExpression(expressionNode) || !ast.is.IsStringLiteral(literalNode)) {
    return undefined;
  }
  const text = ast.text(literalNode);
  return text === "string" || text === "number" || text === "boolean" || text === "bigint" ? text : undefined;
}

function getTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
  options: { readonly allowNullableUnwrap: boolean },
): "string" | "number" | "boolean" | "bigint" | undefined {
  const unwrapped = unwrapNullableTargetType(type);
  if (unwrapped !== type) {
    return options.allowNullableUnwrap ? getTypeofRuntimeKind(unwrapped, options) : undefined;
  }
  if (type?.kind === "source-primitive") {
    return sourcePrimitiveRuntimeKind(type.name);
  }
  if (type?.kind === "target-named") {
    if (type.id === "System.String") {
      return "string";
    }
    if (type.id === "System.Boolean") {
      return "boolean";
    }
    if (type.id === "System.Numerics.BigInteger") {
      return "bigint";
    }
  }
  return undefined;
}

function sourcePrimitiveRuntimeKind(kind: SourcePrimitiveKind): "string" | "number" | "boolean" | "bigint" {
  if (kind === "bool") {
    return "boolean";
  }
  if (kind === "char") {
    return "string";
  }
  return kind === "int64" || kind === "uint64" || kind === "int128" || kind === "uint128"
    ? "bigint"
    : "number";
}

function getCsharpOperatorTargetOperation(operator: string): string | undefined {
  switch (operator) {
    case "===":
    case "==":
      return "==";
    case "!==":
    case "!=":
      return "!=";
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
    case "??":
    case "&":
    case "|":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
    case "!":
    case "~":
    case "++":
    case "--":
      return operator;
    default:
      return undefined;
  }
}

function isCsharpBitwiseOperator(operator: string): boolean {
  return operator === "&" ||
    operator === "|" ||
    operator === "^" ||
    operator === "<<" ||
    operator === ">>" ||
    operator === ">>>" ||
    operator === "&=" ||
    operator === "|=" ||
    operator === "^=" ||
    operator === "<<=" ||
    operator === ">>=" ||
    operator === ">>>=" ||
    operator === "~";
}

function isIntegralTargetTypeRef(type: TargetTypeRef | undefined): boolean {
  if (type?.kind !== "source-primitive") {
    return false;
  }
  switch (type.name) {
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "int64":
    case "uint64":
    case "native-int":
    case "native-uint":
    case "int128":
    case "uint128":
      return true;
    default:
      return false;
  }
}

function getCsharpConversionOperation(source: TargetTypeRef | undefined, target: TargetTypeRef) {
  if (source?.kind === "source-primitive" && target.kind === "source-primitive" && source.name !== target.name) {
    const methodName = sourcePrimitiveConversionMethod(target.name);
    return methodName === undefined
      ? undefined
      : targetOperation(`System.Convert.${methodName}`, "method", `System.Convert.${methodName}`);
  }
  return undefined;
}

function sourcePrimitiveConversionMethod(kind: SourcePrimitiveKind): string | undefined {
  switch (kind) {
    case "bool":
      return "ToBoolean";
    case "int8":
      return "ToSByte";
    case "uint8":
      return "ToByte";
    case "int16":
      return "ToInt16";
    case "uint16":
      return "ToUInt16";
    case "int32":
    case "native-int":
      return "ToInt32";
    case "uint32":
    case "native-uint":
      return "ToUInt32";
    case "int64":
      return "ToInt64";
    case "uint64":
      return "ToUInt64";
    case "float32":
    case "float16":
      return "ToSingle";
    case "float64":
      return "ToDouble";
    case "decimal":
      return "ToDecimal";
    case "char":
    case "int128":
    case "uint128":
      return undefined;
  }
}

function isVoidTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Void";
}

function isCsharpStringType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "System.String";
}

function findTargetMemberForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetMember | undefined {
  const candidates = getTargetMemberCandidates(binding, declaration, sourceName);
  return selectTargetMember(candidates, request.arguments, context);
}

function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): TargetMember | undefined {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  return memberName === undefined ? undefined : members.find((member) => member.sourceName === memberName);
}

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.filter((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  if (memberName !== undefined) {
    return members.filter((member) => member.sourceName === memberName);
  }
  return members.filter((member) => member.kind === "constructor");
}

function selectTargetMember(
  candidates: readonly TargetMember[],
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
): TargetMember | undefined {
  const scored = candidates
    .map((member) => ({ member, score: scoreTargetMember(member, arguments_, context) }))
    .filter((candidate) => candidate.score !== undefined) as readonly { readonly member: TargetMember; readonly score: number }[];
  if (scored.length === 0) {
    return undefined;
  }
  const bestScore = Math.max(...scored.map((candidate) => candidate.score));
  const best = scored.filter((candidate) => candidate.score === bestScore);
  return best.length === 1 ? best[0]!.member : undefined;
}

function scoreTargetMember(
  member: TargetMember,
  arguments_: readonly ExtensionFactSubject[],
  context: ExtensionObservationContext,
): number | undefined {
  const parameterOffset = member.receiverPassing === "first-argument" ? 1 : 0;
  const parameters = member.parameters.slice(parameterOffset);
  if (!targetArityMatches(parameters, arguments_.length)) {
    return undefined;
  }
  let score = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const parameter = getParameterForArgument(parameters, index);
    if (parameter === undefined) {
      return undefined;
    }
    const argumentType = getTargetTypeRefForSubject(arguments_[index], context);
    const argumentScore = scoreTargetTypeMatch(getExpectedTargetTypeForArgument(parameter), argumentType, arguments_[index], context);
    if (argumentScore === undefined) {
      return undefined;
    }
    score += argumentScore;
  }
  return score + (parameters.length === arguments_.length ? 1 : 0);
}

function getExpectedTargetTypeForArgument(parameter: TargetParameter): TargetTypeRef {
  return parameter.paramsArray === true && parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}

function targetArityMatches(parameters: readonly TargetParameter[], argumentCount: number): boolean {
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  const hasParamsArray = parameters.some((parameter) => parameter.paramsArray === true);
  return argumentCount >= required && (hasParamsArray || argumentCount <= parameters.length);
}

function getParameterForArgument(parameters: readonly TargetParameter[], index: number): TargetParameter | undefined {
  const parameter = parameters[index];
  if (parameter !== undefined) {
    return parameter;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function scoreTargetTypeMatch(
  expected: TargetTypeRef,
  actual: TargetTypeRef | undefined,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const delegateScore = scoreDelegateTargetTypeMatch(expected, subject, context);
  if (delegateScore !== undefined) {
    return delegateScore;
  }
  if (expected.kind === "type-parameter") {
    return actual === undefined ? undefined : 2;
  }
  if (expected.kind === "opaque" && (expected.id === "any" || expected.id === "unknown")) {
    return 1;
  }
  if (expected.kind === "target-named" && expected.id === "System.Object") {
    return 1;
  }
  const literalScore = scoreLiteralTargetTypeMatch(expected, subject, context);
  if (literalScore !== undefined) {
    return literalScore;
  }
  if (actual === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(expected, actual)) {
    return 8;
  }
  const structuralScore = scoreStructuralTargetTypeMatch(expected, actual);
  if (structuralScore !== undefined) {
    return structuralScore;
  }
  return undefined;
}

function scoreLiteralTargetTypeMatch(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (expected.kind === "target-named" && expected.id === "System.String") {
    return kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral" ? 6 : undefined;
  }
  if (expected.kind !== "source-primitive") {
    return undefined;
  }
  switch (expected.name) {
    case "bool":
      return ast.kindName(node) === "KindTrueKeyword" || ast.kindName(node) === "KindFalseKeyword" ? 6 : undefined;
    case "char": {
      if (!ast.is.IsStringLiteral(node)) {
        return undefined;
      }
      return [...ast.text(node)].length === 1 ? 6 : undefined;
    }
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && isNumberRepresentableAsPrimitive(value, expected.name) ? 6 : undefined;
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && Number.isFinite(value) ? 6 : undefined;
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = getBigIntLiteralValue(node, context);
      return value !== undefined && isBigIntRepresentableAsPrimitive(value, expected.name) ? 6 : undefined;
    }
  }
}

function getNumericLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindNumericLiteral") {
    return parseFiniteNumberLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindNumericLiteral") {
    return undefined;
  }
  const value = parseFiniteNumberLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function getBigIntLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): bigint | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindBigIntLiteral") {
    return parseBigIntLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindBigIntLiteral") {
    return undefined;
  }
  const value = parseBigIntLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function parseFiniteNumberLiteral(text: string): number | undefined {
  const value = Number(text.split("_").join(""));
  return Number.isFinite(value) ? value : undefined;
}

function parseBigIntLiteral(text: string): bigint | undefined {
  const normalized = text.split("_").join("").replace(/n$/u, "");
  try {
    return BigInt(normalized);
  } catch {
    return undefined;
  }
}

function getPrefixUnaryOperatorKindName(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  const operator = getNodeField(node, "Operator");
  if (typeof operator === "number") {
    return ast.kindName({ Kind: operator } as Node);
  }
  if (typeof operator === "string") {
    return operator;
  }
  const token = asNodeSubject(getNodeField(node, "OperatorToken"));
  return token === undefined ? undefined : ast.kindName(token);
}

function isNumberRepresentableAsPrimitive(value: number, primitive: SourcePrimitiveKind): boolean {
  if (!Number.isInteger(value)) {
    return false;
  }
  switch (primitive) {
    case "int8":
      return value >= -128 && value <= 127;
    case "uint8":
      return value >= 0 && value <= 255;
    case "int16":
      return value >= -32768 && value <= 32767;
    case "uint16":
      return value >= 0 && value <= 65535;
    case "int32":
      return value >= -2147483648 && value <= 2147483647;
    case "uint32":
      return value >= 0 && value <= 4294967295;
    case "native-int":
      return value >= -2147483648 && value <= 2147483647;
    case "native-uint":
      return value >= 0 && value <= 4294967295;
    default:
      return false;
  }
}

function isBigIntRepresentableAsPrimitive(value: bigint, primitive: SourcePrimitiveKind): boolean {
  switch (primitive) {
    case "int64":
      return value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
    case "uint64":
      return value >= 0n && value <= (1n << 64n) - 1n;
    case "int128":
      return value >= -(1n << 127n) && value <= (1n << 127n) - 1n;
    case "uint128":
      return value >= 0n && value <= (1n << 128n) - 1n;
    default:
      return false;
  }
}

function scoreStructuralTargetTypeMatch(expected: TargetTypeRef, actual: TargetTypeRef): number | undefined {
  if (expected.kind === "array" && actual.kind === "array" && (expected.rank ?? 1) === (actual.rank ?? 1)) {
    const elementScore = scoreStructuralTargetTypeMatch(expected.element, actual.element);
    return elementScore === undefined ? undefined : 4 + elementScore;
  }
  if (expected.kind === "tuple" && actual.kind === "tuple" && expected.elements.length === actual.elements.length) {
    const scores = expected.elements.map((element, index) => scoreStructuralTargetTypeMatch(element, actual.elements[index]!));
    return scores.some((score) => score === undefined)
      ? undefined
      : 4 + (scores as readonly number[]).reduce((sum, score) => sum + score, 0);
  }
  if (expected.kind === "target-named" && actual.kind === "target-named" && expected.id === actual.id) {
    const expectedArgs = expected.typeArguments ?? [];
    const actualArgs = actual.typeArguments ?? [];
    if (expectedArgs.length !== actualArgs.length) {
      return undefined;
    }
    const scores = expectedArgs.map((argument, index) => scoreStructuralTargetTypeMatch(argument, actualArgs[index]!));
    return scores.some((score) => score === undefined)
      ? undefined
      : 4 + (scores as readonly number[]).reduce((sum, score) => sum + score, 0);
  }
  if (expected.kind === "pointer" && actual.kind === "pointer") {
    const pointeeScore = scoreStructuralTargetTypeMatch(expected.pointee, actual.pointee);
    return pointeeScore === undefined ? undefined : 4 + pointeeScore;
  }
  if (expected.kind === "function-pointer" && actual.kind === "function-pointer" && expected.args.length === actual.args.length) {
    const argScores = expected.args.map((argument, index) => scoreStructuralTargetTypeMatch(argument, actual.args[index]!));
    const resultScore = scoreStructuralTargetTypeMatch(expected.result, actual.result);
    return resultScore === undefined || argScores.some((score) => score === undefined)
      ? undefined
      : 4 + resultScore + (argScores as readonly number[]).reduce((sum, score) => sum + score, 0);
  }
  return expected.kind === "type-parameter" ? 2 : undefined;
}

function scoreDelegateTargetTypeMatch(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  if (expected.kind !== "target-named") {
    return undefined;
  }
  const stripped = stripMetadataArity(expected.id);
  if (stripped !== "System.Func" && stripped !== "System.Action" && stripped !== "System.Predicate") {
    return undefined;
  }
  const callbackParameterCount = getCallbackParameterCount(subject, context);
  if (callbackParameterCount === undefined) {
    return undefined;
  }
  const genericArgumentCount = (expected.typeArguments ?? []).length;
  const expectedParameterCount = stripped === "System.Func"
    ? genericArgumentCount - 1
    : genericArgumentCount;
  return callbackParameterCount === expectedParameterCount ? 6 : undefined;
}

function getCallbackParameterCount(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (!ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) {
    return undefined;
  }
  return ast.parameters(node).length;
}

function getTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const targetRef = asTargetTypeRef(subject);
  if (targetRef !== undefined) {
    return targetRef;
  }
  const subjectType = asType(subject);
  if (subjectType !== undefined) {
    return getTargetTypeRefForType(subjectType, context, options);
  }
  if (options.allowRuntimeCarrier !== false) {
    const direct = resolveRuntimeCarrier(subject, context);
    if (direct !== undefined) {
      return direct;
    }
  }
  const pointer = context.factResolver.resolve(subject, pointerFactKey);
  if (pointer !== undefined) {
    const pointee = getTargetTypeRefForSubject(pointer.pointee, context, options);
    return pointee === undefined
      ? undefined
      : {
          kind: "pointer",
          pointee,
          mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
        };
  }
  const functionPointer = context.factResolver.resolve(subject, functionPointerFactKey);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => getTargetTypeRefForSubject(parameter, context, options));
    const result = getTargetTypeRefForSubject(functionPointer.result, context, options);
    return result === undefined || args.some((arg) => arg === undefined)
      ? undefined
      : {
          kind: "function-pointer",
          args: args as readonly TargetTypeRef[],
          result,
          ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
        };
  }
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const selectedCallReturn = context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType;
  if (selectedCallReturn !== undefined) {
    return selectedCallReturn;
  }
  const operationResult = context.factResolver.resolve(subject, targetOperationFactKey)?.resultType;
  if (operationResult !== undefined && operationResult !== subject) {
    const operationResultType = getTargetTypeRefForSubject(operationResult, context, options);
    if (operationResultType !== undefined) {
      return operationResultType;
    }
  }
  const expressionResult = getTargetTypeRefFromCheckedExpressionSyntax(subject, context, options);
  if (expressionResult !== undefined) {
    return expressionResult;
  }
  const catchVariableType = getCatchVariableTargetTypeRef(subject, context);
  if (catchVariableType !== undefined) {
    return catchVariableType;
  }
  const binding = resolveTargetBinding(subject, context);
  if (binding !== undefined) {
    return { kind: "target-named", id: binding.id };
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(subject, context);
  if (providerVirtualTarget !== undefined) {
    return providerVirtualTarget;
  }
  const syntaxType = getTargetTypeRefFromSyntax(subject, context, options);
  if (syntaxType !== undefined) {
    return syntaxType;
  }
  const declarationType = getTargetTypeRefFromDeclarationAnnotation(subject, context, options);
  if (declarationType !== undefined) {
    return declarationType;
  }
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  const type = node === undefined || checker === undefined || options.allowSemanticTypeQuery === false
    ? undefined
    : ast !== undefined && isTypeSyntaxNode(ast, node)
      ? asType(checker.getTypeFromTypeNode(node))
      : asType(checker.getTypeAtLocation(node));
  return getTargetTypeRefForType(type, context, {
    ...options,
    ...(ast !== undefined && node !== undefined ? { sourceFile: ast.getSourceFile(node) } : {}),
  });
}

function getTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (options.allowRuntimeCarrier !== false) {
    const direct = resolveRuntimeCarrier(type, context) ??
      resolveRuntimeCarrier(type.symbol, context);
    if (direct !== undefined) {
      return direct;
    }
  }
  const primitive = context.factResolver.resolve(type, sourcePrimitiveFactKey) ??
    (type.symbol === undefined ? undefined : context.factResolver.resolve(type.symbol, sourcePrimitiveFactKey));
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const sourceArray = getSourceArrayTargetTypeRef(type, context, options);
  if (sourceArray !== undefined) {
    return sourceArray;
  }
  if (isSourceLibraryType(type, context, "Promise")) {
    const result = getTargetTypeRefForType(getFirstTypeArgument(type, context, options), context, options);
    return result === undefined || isVoidTargetType(result)
      ? csharpTargetNamedType("System.Threading.Tasks.Task")
      : csharpTargetNamedType("System.Threading.Tasks.Task`1", [result]);
  }
  const binding = resolveTargetBinding(type.symbol, context);
  if (binding !== undefined) {
    const targetTypeArguments = getTargetTypeArgumentsForType(type, context, options);
    return {
      kind: "target-named",
      id: binding.id,
      ...(targetTypeArguments.length > 0 ? { typeArguments: targetTypeArguments } : {}),
    };
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(type.symbol, context) ??
    getProviderVirtualDeclarationTargetTypeRefFromDeclarations(type, context);
  if (providerVirtualTarget !== undefined) {
    const targetTypeArguments = getTargetTypeArgumentsForType(type, context, options);
    return {
      ...providerVirtualTarget,
      ...(targetTypeArguments.length > 0 ? { typeArguments: targetTypeArguments } : {}),
    };
  }
  const typeParameterName = getTypeParameterName(type, context);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  if (types.isUnion(type)) {
    const nullable = getNullableUnionTargetTypeRef(type, context, options);
    if (nullable !== undefined) {
      return nullable;
    }
    return undefined;
  }
  const declaredShape = getSemanticTypeDeclarationShape(type, context);
  if (declaredShape !== undefined) {
    return declaredShape.targetType;
  }
  if (types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (types.isStringLike(type)) {
    return csharpTargetNamedType("System.String");
  }
  if (types.isBigIntLike(type)) {
    return csharpTargetNamedType("System.Numerics.BigInteger");
  }
  const callable = getCallableTargetTypeRefForSemanticType(type, context, options);
  if (callable !== undefined) {
    return callable;
  }
  if (types.isTuple(type)) {
    const elements = types.getTupleElementTypes(type, typeShapeOptions(options))
      .map((element) => getTargetTypeRefForType(element, context, options));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
  }
  return undefined;
}

function getSourceArrayTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const types = context.compiler?.types;
  if (types === undefined || !types.isArrayLike(type, typeShapeOptions(options))) {
    return undefined;
  }
  const sourceArrayType = isSourceLibraryType(type, context, "Array") ||
    isSourceLibraryType(type, context, "ReadonlyArray");
  if (!sourceArrayType) {
    return undefined;
  }
  const element = getTargetTypeRefForType(getFirstTypeArgument(type, context, options), context, options);
  return element === undefined ? undefined : { kind: "array", element };
}

function getCatchVariableTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  const node = asNodeSubject(subject);
  if (ast === undefined || checker === undefined || node === undefined || !ast.is.IsIdentifier(node)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(node) ?? checker.getResolvedSymbol(node);
  const declarations = getSymbolDeclarations(symbol);
  return declarations.some((declaration) => {
      const parent = asNodeSubject(getNodeField(declaration, "Parent"));
      return parent !== undefined && ast.is.IsCatchClause(parent);
    })
    ? csharpTargetNamedType("System.Exception")
    : undefined;
}

function getCallableTargetTypeRefForSemanticType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const checker = context.compiler?.checker;
  const types = context.compiler?.types;
  if (checker === undefined || types === undefined) {
    return undefined;
  }
  const signatures = types.getCallSignatures(type);
  if (signatures.length !== 1) {
    return undefined;
  }
  const signature = signatures[0]!;
  const parameters = (signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [];
  const parameterTypes = parameters.map((parameter) => getTargetTypeRefForType(checker.getTypeOfSymbol(parameter), context, options));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForType(types.getReturnTypeOfSignature(signature), context, options);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameterTypes.length}`, parameterTypes as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameterTypes.length + 1}`, [...(parameterTypes as readonly TargetTypeRef[]), returnType]);
}

function getNullableUnionTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const unionTypes = types.getUnionOrIntersectionTypes(type);
  const nonNullish = unionTypes.filter((candidate) => !types.isNullish(candidate));
  if (nonNullish.length !== 1 || nonNullish.length === unionTypes.length) {
    return undefined;
  }
  const inner = getTargetTypeRefForType(nonNullish[0], context, options);
  return inner === undefined
    ? undefined
    : csharpTargetNamedType("System.Nullable`1", [inner]);
}

function unwrapNullableTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      type.id === "System.Nullable`1" &&
      (type.typeArguments ?? []).length === 1
    ? type.typeArguments![0]
    : type;
}

function getFirstTypeArgument(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): Type | undefined {
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const typeArgument = types.isTypeReference(type)
    ? types.getTypeArguments(type, typeShapeOptions(options))[0]
    : undefined;
  if (typeArgument !== undefined) {
    return typeArgument;
  }
  return types.getIndexInfos(type)
    .map((info) => (info as { readonly valueType?: unknown }).valueType)
    .find((value): value is Type => asType(value) !== undefined);
}

function resolveRuntimeCarrier(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier;
}

function getProviderVirtualDeclarationTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const targetIdentity = subject === undefined
    ? undefined
    : context.factResolver.resolve(subject, providerVirtualDeclarationFactKey)?.targetIdentity;
  return targetIdentity?.kind === "target-named" ? targetIdentity : undefined;
}

function getProviderVirtualDeclarationTargetTypeRefFromDeclarations(
  type: Type,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  for (const declaration of getSymbolDeclarations(type.symbol)) {
    const target = getProviderVirtualDeclarationTargetTypeRef(declaration, context);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}

function getTargetTypeRefFromDeclarationAnnotation(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  if (node === undefined || checker === undefined || ast === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, ast.getSourceFile(node));
  const declarations = getSymbolDeclarations(symbol);
  for (const declaration of declarations) {
    const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
    if (typeNode !== undefined && typeNode !== node) {
      const result = getTargetTypeRefForSubject(typeNode, context, options);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function getTargetTypeRefFromSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  const keywordType = getTargetTypeRefFromKeywordTypeSyntax(ast, node);
  if (keywordType !== undefined) {
    return keywordType;
  }
  if (ast.is.IsNewExpression(node)) {
    return getTargetTypeRefFromConstructedExpressionSyntax(node, context, options);
  }
  if (ast.is.IsTypeReferenceNode(node)) {
    return getTargetTypeRefFromTypeReferenceSyntax(node, context, options);
  }
  if (ast.is.IsArrayTypeNode(node)) {
    const element = getTargetTypeRefForSubject(asNodeSubject(getNodeField(node, "ElementType")), context, options);
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (ast.is.IsUnionTypeNode(node)) {
    const nullable = getNullableUnionTargetTypeRefFromSyntax(node, context, options);
    if (nullable !== undefined) {
      return nullable;
    }
  }
  if (ast.is.IsTypeLiteralNode(node)) {
    return getCsharpObjectShapeFactForSubject(node, context)?.targetType;
  }
  if (ast.is.IsFunctionTypeNode(node) || ast.is.IsConstructorTypeNode(node)) {
    return getFunctionTargetTypeRefFromSignatureLikeSubject(node, context, options);
  }
  return undefined;
}

function getTargetTypeRefFromCheckedExpressionSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  if (ast.is.IsParenthesizedExpression(node)) {
    return getTargetTypeRefForSubject(asNodeSubject(getNodeField(node, "Expression")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    });
  }
  if (ast.kindName(node) === "KindPrefixUnaryExpression") {
    const operator = getPrefixUnaryOperatorText(ast, node);
    const operandType = getTargetTypeRefForSubject(asNodeSubject(getNodeField(node, "Operand")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    });
    if (operator === "!") {
      return csharpSourcePrimitiveTargetType("bool");
    }
    if (operator === "~") {
      return isIntegralTargetTypeRef(operandType) ? operandType : undefined;
    }
    return operandType;
  }
  if (!ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const operator = getBinaryOperatorText(ast, node);
  if (operator === undefined) {
    return undefined;
  }
  const operandOptions = operator === "??"
    ? {
        ...options,
        allowSemanticTypeQuery: true,
      }
    : {
        ...options,
        allowSemanticTypeQuery: false,
      };
  const left = getTargetTypeRefForSubject(asNodeSubject(getNodeField(node, "Left")), context, {
    ...operandOptions,
  });
  const rightSubject = asNodeSubject(getNodeField(node, "Right"));
  const right = getTargetTypeRefForSubject(rightSubject, context, {
    ...operandOptions,
  }) ?? getLiteralTargetTypeRefForKnownOperatorOperand(left, rightSubject, context);
  if (operator === "===" ||
    operator === "==" ||
    operator === "!==" ||
    operator === "!=" ||
    operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=" ||
    operator === "&&" ||
    operator === "||") {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (operator === "??") {
    return unwrapNullableTargetType(left) ?? right;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left)) {
    return undefined;
  }
  return left;
}

function getBinaryOperatorText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const operatorToken = asNodeSubject(getNodeField(node, "OperatorToken"));
  return operatorToken === undefined ? undefined : getOperatorTextFromKindName(ast.kindName(operatorToken));
}

function getPrefixUnaryOperatorText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const operator = getNodeField(node, "Operator");
  return typeof operator === "number"
    ? getOperatorTextFromKindName(ast.kindName({ Kind: operator } as Node))
    : undefined;
}

function getOperatorTextFromKindName(kind: string): string | undefined {
  switch (kind) {
    case "KindEqualsEqualsEqualsToken":
      return "===";
    case "KindEqualsEqualsToken":
      return "==";
    case "KindExclamationEqualsEqualsToken":
      return "!==";
    case "KindExclamationEqualsToken":
      return "!=";
    case "KindLessThanToken":
      return "<";
    case "KindLessThanEqualsToken":
      return "<=";
    case "KindGreaterThanToken":
      return ">";
    case "KindGreaterThanEqualsToken":
      return ">=";
    case "KindAmpersandAmpersandToken":
      return "&&";
    case "KindBarBarToken":
      return "||";
    case "KindQuestionQuestionToken":
      return "??";
    case "KindAmpersandToken":
      return "&";
    case "KindBarToken":
      return "|";
    case "KindCaretToken":
      return "^";
    case "KindLessThanLessThanToken":
      return "<<";
    case "KindGreaterThanGreaterThanToken":
      return ">>";
    case "KindGreaterThanGreaterThanGreaterThanToken":
      return ">>>";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
    case "KindSlashToken":
      return "/";
    case "KindPercentToken":
      return "%";
    case "KindEqualsToken":
      return "=";
    case "KindPlusEqualsToken":
      return "+=";
    case "KindMinusEqualsToken":
      return "-=";
    case "KindAsteriskEqualsToken":
      return "*=";
    case "KindSlashEqualsToken":
      return "/=";
    case "KindPercentEqualsToken":
      return "%=";
    case "KindAmpersandEqualsToken":
      return "&=";
    case "KindBarEqualsToken":
      return "|=";
    case "KindCaretEqualsToken":
      return "^=";
    case "KindLessThanLessThanEqualsToken":
      return "<<=";
    case "KindGreaterThanGreaterThanEqualsToken":
      return ">>=";
    case "KindGreaterThanGreaterThanGreaterThanEqualsToken":
      return ">>>=";
    case "KindExclamationToken":
      return "!";
    case "KindTildeToken":
      return "~";
    case "KindPlusPlusToken":
      return "++";
    case "KindMinusMinusToken":
      return "--";
    default:
      return undefined;
  }
}

function getTargetTypeRefFromConstructedExpressionSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined) {
    return undefined;
  }
  const binding = findTargetBinding(context, [expression]);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = getNodeList(getNodeField(node, "TypeArguments"))
    .map((argument) => getTargetTypeRefForSubject(argument, context, options));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-named",
    id: binding.id,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
}

function getTargetTypeRefFromTypeReferenceSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (ast === undefined || checker === undefined || typeName === undefined) {
    return undefined;
  }
  const type = asType(checker.getTypeFromTypeNode(node));
  const candidateSubjects: readonly (ExtensionFactSubject | undefined)[] = [
    node,
    typeName,
    type?.symbol,
    checker.getSymbolAtLocation(typeName),
  ];
  for (const candidate of candidateSubjects) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const aliasedType = getTargetTypeRefFromTypeAliasDeclarations(candidateSubjects, node, context, options);
  if (aliasedType !== undefined) {
    return aliasedType;
  }
  for (const candidate of [type, type?.symbol]) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const binding = findTargetBinding(context, candidateSubjects);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = ast.typeArguments(node).map((argument) => getTargetTypeRefForSubject(argument, context, options));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return csharpTargetNamedType(binding.id, typeArguments as readonly TargetTypeRef[]);
}

function getTargetTypeRefFromKeywordTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  switch (ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpTargetNamedType("System.String");
    case "KindBigIntKeyword":
      return csharpTargetNamedType("System.Numerics.BigInteger");
    case "KindVoidKeyword":
      return csharpTargetNamedType("System.Void");
    default:
      return undefined;
  }
}

function getTargetTypeRefFromTypeAliasDeclarations(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const declarations = getSymbolDeclarations(subject);
    for (const declaration of declarations) {
      const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
      if (typeNode === undefined || typeNode === currentNode) {
        continue;
      }
      const result = getTargetTypeRefForSubject(typeNode, context, options);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

function getNullableUnionTargetTypeRefFromSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const members = getNodeList(getNodeField(node, "Types"));
  const nonNullish = members.filter((member) => !isNullishTypeSyntax(member, context));
  if (nonNullish.length !== 1 || nonNullish.length === members.length) {
    return undefined;
  }
  const inner = getTargetTypeRefForSubject(nonNullish[0], context, options);
  return inner === undefined ? undefined : csharpTargetNamedType("System.Nullable`1", [inner]);
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

function getFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const childOptions = {
    ...options,
    allowRuntimeCarrier: true,
  };
  const parameters = getNodeList(getNodeField(node, "Parameters"))
    .map((parameter) => getTargetTypeRefForSubject(asNodeSubject(getNodeField(parameter, "Type")), context, childOptions));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForSubject(asNodeSubject(getNodeField(node, "Type")), context, childOptions);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameters.length}`, parameters as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameters.length + 1}`, [...(parameters as readonly TargetTypeRef[]), returnType]);
}

function asNodeSubject(subject: unknown): Node | undefined {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number"
    ? subject as Node
    : undefined;
}

function isTypeSyntaxNode(ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"], node: Node): boolean {
  const kind = ast.kindName(node);
  if (
    kind === "KindAnyKeyword" ||
    kind === "KindUnknownKeyword" ||
    kind === "KindBooleanKeyword" ||
    kind === "KindNumberKeyword" ||
    kind === "KindStringKeyword" ||
    kind === "KindBigIntKeyword" ||
    kind === "KindVoidKeyword" ||
    kind === "KindNeverKeyword" ||
    kind === "KindObjectKeyword" ||
    kind === "KindSymbolKeyword" ||
    kind === "KindTypeReference" ||
    kind === "KindUnionType" ||
    kind === "KindIntersectionType" ||
    kind === "KindArrayType" ||
    kind === "KindTupleType" ||
    kind === "KindTypeLiteral" ||
    kind === "KindFunctionType" ||
    kind === "KindConstructorType" ||
    kind === "KindLiteralType" ||
    kind === "KindIndexedAccessType" ||
    kind === "KindConditionalType" ||
    kind === "KindInferType" ||
    kind === "KindMappedType" ||
    kind === "KindOptionalType" ||
    kind === "KindRestType" ||
    kind === "KindParenthesizedType" ||
    kind === "KindTemplateLiteralType" ||
    kind === "KindImportType" ||
    kind === "KindThisType"
  ) {
    return true;
  }
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

function asType(subject: unknown): Type | undefined {
  return typeof subject === "object" && subject !== null && "flags" in subject ? subject as Type : undefined;
}

function asTargetParameter(subject: ExtensionFactSubject | undefined): TargetParameter | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const parameter = subject as { readonly name?: unknown; readonly type?: unknown; readonly passingMode?: unknown };
  return typeof parameter.name === "string" &&
    typeof parameter.passingMode === "string" &&
    asTargetTypeRef(parameter.type) !== undefined
    ? subject as TargetParameter
    : undefined;
}

function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}

function getTargetTypeArgumentsForType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): readonly TargetTypeRef[] {
  const types = context.compiler?.types;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  return types.getTypeArguments(type, typeShapeOptions(options))
    .map((argument) => getTargetTypeRefForType(argument, context, options))
    .filter((argument): argument is TargetTypeRef => argument !== undefined);
}

function typeShapeOptions(options: TargetTypeRefResolutionOptions): { readonly sourceFile: SourceFile } | undefined {
  return options.sourceFile === undefined ? undefined : { sourceFile: options.sourceFile };
}

function getTypeParameterName(type: Type, context: ExtensionObservationContext): string | undefined {
  const ast = context.compiler?.ast;
  const declarations = (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  if (ast === undefined) {
    return undefined;
  }
  for (const declaration of declarations) {
    if (ast.is.IsTypeParameterDeclaration(declaration)) {
      const name = ast.text(ast.name(declaration));
      return name.length === 0 ? undefined : name;
    }
  }
  return undefined;
}

function isSourceLibraryType(type: Type, context: ExtensionObservationContext, name: string): boolean {
  const ast = context.compiler?.ast;
  const types = context.compiler?.types;
  if (ast === undefined || types === undefined) {
    return false;
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  const declarations = (target?.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    [];
  return declarations.some((declaration) =>
    ast.text(ast.name(declaration)) === name &&
    ast.getFileName(ast.getSourceFile(declaration)).startsWith("bundled:///libs/"));
}

function targetTypeRefEquals(left: TargetTypeRef, right: TargetTypeRef): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "source-primitive":
      return right.kind === "source-primitive" && left.name === right.name;
    case "target-named":
      return right.kind === "target-named" &&
        left.id === right.id &&
        targetTypeRefListEquals(left.typeArguments ?? [], right.typeArguments ?? []);
    case "type-parameter":
      return right.kind === "type-parameter" && left.name === right.name;
    case "array":
      return right.kind === "array" &&
        (left.rank ?? 1) === (right.rank ?? 1) &&
        targetTypeRefEquals(left.element, right.element);
    case "tuple":
      return right.kind === "tuple" && targetTypeRefListEquals(left.elements, right.elements);
    case "pointer":
      return right.kind === "pointer" &&
        left.mutability === right.mutability &&
        targetTypeRefEquals(left.pointee, right.pointee);
    case "function-pointer":
      return right.kind === "function-pointer" &&
        targetTypeRefListEquals(left.args, right.args) &&
        targetTypeRefEquals(left.result, right.result);
    case "opaque":
      return right.kind === "opaque" && left.id === right.id;
    case "associated-type":
      return right.kind === "associated-type" &&
        left.name === right.name &&
        targetTypeRefEquals(left.owner, right.owner);
    case "lifetime":
      return right.kind === "lifetime" && left.name === right.name;
    case "target-specific":
      return right.kind === "target-specific" &&
        left.target === right.target &&
        left.name === right.name &&
        Object.is(left.value, right.value);
  }
}

function targetTypeRefListEquals(left: readonly TargetTypeRef[], right: readonly TargetTypeRef[]): boolean {
  return left.length === right.length && left.every((item, index) => targetTypeRefEquals(item, right[index]!));
}

function stripMetadataArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}

function targetOperationFromMember(member: TargetMember) {
  return {
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" as const : member.kind,
    targetOperation: member.static === true && member.declaringType?.kind === "target-named"
      ? `${member.declaringType.id}.${member.targetName}`
      : member.targetName,
  };
}

function mapRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
) {
  const primitive = (request.sourceTypeReference === undefined ? undefined : context.factResolver.resolve(request.sourceTypeReference, sourcePrimitiveFactKey)) ??
    (request.sourceTypeSymbol === undefined ? undefined : context.factResolver.resolve(request.sourceTypeSymbol, sourcePrimitiveFactKey)) ??
    context.factResolver.resolve(request.type, sourcePrimitiveFactKey);
  const syntaxCarrier = request.sourceTypeReference === undefined
    ? undefined
    : getTargetTypeRefForSubject(request.sourceTypeReference, context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false });
  if (syntaxCarrier !== undefined) {
    recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, syntaxCarrier);
    return acceptObservation<RuntimeCarrierFactResult>({
      carrier: syntaxCarrier,
    }, [{ message: "C# runtime carrier mapped from source syntax/provider facts." }]);
  }
  if (primitive === undefined) {
      const objectShape = getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
      getRecordedCsharpObjectShapeFactForSubject(request.type, context);
    if (objectShape !== undefined) {
      recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
      return acceptObservation<RuntimeCarrierFactResult>({
        carrier: objectShape.targetType,
      }, [{ message: "C# runtime carrier mapped from finalized structural object-shape facts." }]);
    }
    const carrier = getTargetTypeRefForType(asType(request.type), context, { allowRuntimeCarrier: false });
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

function recordMatchingCsharpObjectShapeFactOnRuntimeCarrierSubjects(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  carrier: TargetTypeRef,
): void {
  const objectShape = getRecordedCsharpObjectShapeFactForSubject(request.sourceTypeReference, context) ??
    getRecordedCsharpObjectShapeFactForSubject(request.type, context);
  if (objectShape === undefined || !targetTypeRefEquals(objectShape.targetType, carrier)) {
    return;
  }
  recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(request, context, objectShape);
}

function recordCsharpObjectShapeFactOnRuntimeCarrierSubjects(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  objectShape: CsharpObjectShapeFact,
): void {
  context.facts.set(request.type, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to runtime carrier type." }]);
  if (request.sourceTypeReference !== undefined) {
    context.facts.set(request.sourceTypeReference, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type reference." }]);
  }
  if (request.sourceTypeSymbol !== undefined) {
    context.facts.set(request.sourceTypeSymbol, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type symbol." }]);
  }
  const typeSymbol = asType(request.type)?.symbol;
  if (typeSymbol !== undefined) {
    context.facts.set(typeSymbol, csharpObjectShapeFactKey, objectShape, [{ message: "C# object-shape fact attached to source type symbol." }]);
  }
}

function recordCsharpSourceFileFacts(
  request: SourceFileBoundLifecycleRequest,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  const sourceFile = asNodeSubject(request.sourceFile);
  if (sourceFile === undefined || request.providerVirtualModule !== undefined) {
    return;
  }
  visitStructuralNodes(sourceFile, (node) => {
    recordCsharpObjectShapeFact(node, facts, ast);
    recordCsharpTypeParameterConstraintFact(node, facts, ast);
  });
}

function recordCsharpObjectShapeFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  if (!isTypeLiteralLikeNode(node)) {
    return;
  }
  const members = getNodeList(getNodeField(node, "Members"));
  if (members.length === 0) {
    return;
  }
  const shapeMembers = members
    .map((member) => member === undefined ? undefined : getCsharpObjectShapeMemberFact(member, facts, ast))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return;
  }
  const fact = {
    targetType: csharpTargetNamedType(getObjectShapeTargetName("__TsonicShape", shapeMembers)),
    members: shapeMembers,
  } satisfies CsharpObjectShapeFact;
  facts.set(node, csharpObjectShapeFactKey, fact, [{ message: "C# object-shape fact recorded from structural type literal." }]);
}

function getCsharpObjectShapeMemberFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = getNodeNameText(node);
  if (sourceName.length === 0) {
    return undefined;
  }
  const memberKind = getNodeList(getNodeField(node, "Parameters")).length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? getFunctionTargetTypeRefFromSignatureLikeNode(node, facts, ast)
    : getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(node, "Type") ?? getNodeField(node, "type")), facts, ast);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
    ...(getNodeField(node, "QuestionToken") !== undefined ? { optional: true } : {}),
  };
}

function recordCsharpTypeParameterConstraintFact(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): void {
  const constraintNode = asNodeSubject(getNodeField(node, "Constraint"));
  if (constraintNode === undefined || getNodeNameText(node).length === 0) {
    return;
  }
  const constraintType = getTargetTypeRefForSyntaxNode(constraintNode, facts, ast);
  if (constraintType?.kind !== "source-primitive") {
    return;
  }
  const constraint = getCsharpTypeParameterConstraintForPrimitive(constraintType.name);
  if (constraint === undefined) {
    return;
  }
  facts.set(node, csharpTargetTypeParameterConstraintFactKey, {
    constraints: [constraint],
  }, [{ message: "C# type-parameter constraint fact recorded from source primitive constraint." }]);
}

function getCsharpTypeParameterConstraintForPrimitive(kind: SourcePrimitiveKind): TargetConstraint | undefined {
  return sourcePrimitiveRuntimeKind(kind) === "number" || sourcePrimitiveRuntimeKind(kind) === "bigint"
    ? { kind: "target-specific", target: csharpTargetId, name: "generic-math-number" }
    : undefined;
}

function getFunctionTargetTypeRefFromSignatureLikeNode(
  node: Node,
  facts: ExtensionFactStore,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): TargetTypeRef | undefined {
  const parameters = getNodeList(getNodeField(node, "Parameters"))
    .map((parameter) => getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(parameter, "Type")), facts, ast));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForSyntaxNode(asNodeSubject(getNodeField(node, "Type")), facts, ast);
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameters.length}`, parameters as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameters.length + 1}`, [...(parameters as readonly TargetTypeRef[]), returnType]);
}

function getTargetTypeRefForSyntaxNode(
  node: Node | undefined,
  facts: ExtensionFactStore,
  ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  const keyword = ast === undefined ? undefined : getTargetTypeRefFromKeywordTypeSyntax(ast, node);
  if (keyword !== undefined) {
    return keyword;
  }
  const direct = facts.get(node, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  const primitive = facts.get(node, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const binding = facts.get(node, targetBindingFactKey);
  if (binding !== undefined) {
    return csharpTargetNamedType(binding.id);
  }
  const objectShape = facts.get(node, csharpObjectShapeFactKey);
  if (objectShape !== undefined) {
    return objectShape.targetType;
  }
  const elementTypeNode = asNodeSubject(getNodeField(node, "ElementType"));
  if (elementTypeNode !== undefined) {
    const elementType = getTargetTypeRefForSyntaxNode(elementTypeNode, facts, ast);
    if (elementType === undefined) {
      return undefined;
    }
    return { kind: "array", element: elementType };
  }
  if (getNodeList(getNodeField(node, "Parameters")).length > 0) {
    return getFunctionTargetTypeRefFromSignatureLikeNode(node, facts, ast);
  }
  return undefined;
}

function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (recorded !== undefined) {
    return recorded;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context);
}

function getRecordedCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const direct = context.facts.get(subject, csharpObjectShapeFactKey);
  if (direct !== undefined) {
    return direct;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  const declarationFact = declarationType === undefined ? undefined : context.facts.get(declarationType, csharpObjectShapeFactKey);
  if (declarationFact !== undefined) {
    return declarationFact;
  }
  return undefined;
}

function deriveCsharpObjectShapeFactForSemanticSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const node = asNodeSubject(subject);
  const sourceFile = node === undefined ? undefined : compiler.ast.getSourceFile(node);
  const semanticType = asType(subject) ??
    (node === undefined ? undefined : compiler.checker.getTypeAtLocation(node, { sourceFile }));
  if (semanticType === undefined ||
    compiler.types.isAny(semanticType) ||
    compiler.types.isUnknown(semanticType) ||
    compiler.types.isStringLike(semanticType) ||
    compiler.types.isNumberLike(semanticType) ||
    compiler.types.isBooleanLike(semanticType) ||
    compiler.types.isBigIntLike(semanticType) ||
    compiler.types.isArrayLike(semanticType, { sourceFile }) ||
    compiler.types.isUnion(semanticType)) {
    return undefined;
  }
  const contextualTargetType = asType(node === undefined ? undefined : context.facts.get(node, contextualTargetTypeFactKey)?.type);
  const declaredShape = getSemanticTypeDeclarationShape(contextualTargetType ?? semanticType, context);
  if (declaredShape?.kind === "class" || declaredShape?.kind === "enum") {
    return undefined;
  }
  if (declaredShape?.kind === "interface" &&
    (node === undefined || (!compiler.ast.is.IsObjectLiteralExpression(node) && compiler.ast.kindName(node) !== "KindObjectLiteralExpression"))) {
    return undefined;
  }
  const properties = compiler.types.getProperties(semanticType, { sourceFile })
    .filter((property): property is Symbol => property !== undefined);
  if (properties.length === 0) {
    return undefined;
  }
  const members = properties
    .map((property) => deriveCsharpObjectShapeMemberFactForSemanticProperty(semanticType, property, context, sourceFile))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (members.length !== properties.length) {
    return undefined;
  }
  const implementsTypes = declaredShape?.kind === "interface"
    ? [declaredShape.targetType]
    : undefined;
  const shapeNamePrefix = declaredShape?.kind === "interface"
    ? `__TsonicShape_${sourceNameToCsharpMemberName(declaredShape.name)}`
    : "__TsonicShape";
  return {
    targetType: csharpTargetNamedType(getObjectShapeTargetName(shapeNamePrefix, members, implementsTypes)),
    members,
    ...(implementsTypes === undefined ? {} : { implements: implementsTypes }),
  };
}

function getSemanticTypeDeclarationShape(
  type: Type,
  context: ExtensionObservationContext,
): { readonly kind: "class" | "interface" | "enum"; readonly name: string; readonly targetType: TargetTypeRef } | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const declarations = getSymbolDeclarations(type.symbol);
  for (const declaration of declarations) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    const name = getNodeNameText(declaration);
    if (name.length === 0) {
      continue;
    }
    const targetTypeArguments = getTargetTypeArgumentsForType(type, context, {});
    const targetType = csharpTargetNamedType(name, targetTypeArguments);
    if (kind === "KindClassDeclaration") {
      return { kind: "class", name, targetType };
    }
    if (kind === "KindInterfaceDeclaration") {
      return { kind: "interface", name, targetType };
    }
    return { kind: "enum", name, targetType };
  }
  return undefined;
}

function deriveCsharpObjectShapeMemberFactForSemanticProperty(
  ownerType: Type,
  property: Symbol,
  context: ExtensionObservationContext,
  sourceFile: Node | undefined extends never ? never : ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]>,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = property.Name;
  if (sourceName.length === 0 || context.compiler === undefined) {
    return undefined;
  }
  const propertyType = context.compiler.types.getPropertyType(ownerType, sourceName, { sourceFile });
  const signatures = context.compiler.types.getCallSignatures(propertyType, { sourceFile });
  const memberKind = signatures.length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? getFunctionTargetTypeRefFromSemanticSignature(signatures[0], context, sourceFile)
    : getTargetTypeRefForType(propertyType, context);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
  };
}

function getFunctionTargetTypeRefFromSemanticSignature(
  signature: unknown,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): TargetTypeRef | undefined {
  const compiler = context.compiler;
  if (compiler === undefined || signature === undefined) {
    return undefined;
  }
  const parameterTypes = ((signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [])
    .map((parameter) => getTargetTypeRefForType(compiler.checker.getTypeOfSymbol(parameter, { sourceFile }), context));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = getTargetTypeRefForType(compiler.types.getReturnTypeOfSignature(signature as Parameters<typeof compiler.types.getReturnTypeOfSignature>[0], { sourceFile }), context);
  return returnType === undefined || isVoidTargetType(returnType)
    ? csharpTargetNamedType(`System.Action\`${parameterTypes.length}`, parameterTypes as readonly TargetTypeRef[])
    : csharpTargetNamedType(`System.Func\`${parameterTypes.length + 1}`, [...(parameterTypes as readonly TargetTypeRef[]), returnType]);
}

function deriveCsharpObjectShapeFactForSubject(
  node: Node | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  if (node === undefined || !isTypeLiteralLikeNode(node)) {
    return undefined;
  }
  const members = getNodeList(getNodeField(node, "Members"));
  if (members.length === 0) {
    return undefined;
  }
  const shapeMembers = members
    .map((member) => deriveCsharpObjectShapeMemberFactForSubject(member, context))
    .filter((member): member is CsharpObjectShapeMemberFact => member !== undefined);
  if (shapeMembers.length !== members.length) {
    return undefined;
  }
  return {
    targetType: csharpTargetNamedType(getObjectShapeTargetName("__TsonicShape", shapeMembers)),
    members: shapeMembers,
  };
}

function objectShapeMemberKey(member: CsharpObjectShapeMemberFact): string {
  return [
    member.sourceName,
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    targetTypeRefKey(member.type),
  ].join(":");
}

function getObjectShapeTargetName(
  prefix: string,
  members: readonly CsharpObjectShapeMemberFact[],
  implementsTypes: readonly TargetTypeRef[] | undefined = undefined,
): string {
  const key = [
    ...members.map(objectShapeMemberKey).sort(),
    ...(implementsTypes ?? []).map((type) => `implements:${targetTypeRefKey(type)}`),
  ].join("|");
  return `${prefix}_${hashString(key)}`;
}

function targetTypeRefKey(type: TargetTypeRef): string {
  switch (type.kind) {
    case "source-primitive":
      return `source:${type.name}`;
    case "target-named":
      return `target:${type.id}<${(type.typeArguments ?? []).map(targetTypeRefKey).join(",")}>`;
    case "type-parameter":
      return `type-param:${type.name}`;
    case "array":
      return `array:${targetTypeRefKey(type.element)}`;
    case "tuple":
      return `tuple:${type.elements.map(targetTypeRefKey).join(",")}`;
    case "pointer":
      return `pointer:${type.mutability}:${targetTypeRefKey(type.pointee)}`;
    case "function-pointer":
      return `fnptr:${type.abi ?? ""}:${type.args.map(targetTypeRefKey).join(",")}=>${targetTypeRefKey(type.result)}`;
    case "opaque":
      return `opaque:${type.id}`;
    case "associated-type":
      return `associated:${type.name}:${targetTypeRefKey(type.owner)}`;
    case "lifetime":
      return `lifetime:${type.name}`;
    case "target-specific":
      return `target-specific:${type.target}:${type.name}:${String(type.value)}`;
  }
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function deriveCsharpObjectShapeMemberFactForSubject(
  member: Node,
  context: ExtensionObservationContext,
): CsharpObjectShapeMemberFact | undefined {
  const sourceName = getNodeNameText(member);
  if (sourceName.length === 0) {
    return undefined;
  }
  const memberKind = getNodeList(getNodeField(member, "Parameters")).length > 0 ? "method" : "property";
  const type = memberKind === "method"
    ? getFunctionTargetTypeRefFromSignatureLikeSubject(member, context, {})
    : getTargetTypeRefForSubject(asNodeSubject(getNodeField(member, "Type") ?? getNodeField(member, "type")), context);
  if (type === undefined) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sourceNameToCsharpMemberName(sourceName),
    memberKind,
    type,
    ...(getNodeField(member, "QuestionToken") !== undefined ? { optional: true } : {}),
  };
}

function getDeclarationTypeNode(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (checker === undefined || ast === undefined || node === undefined) {
    return undefined;
  }
  if (isTypeSyntaxNode(ast, node)) {
    return node;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  const aliasedSymbol = getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
  const declarations = [
    ...getSymbolDeclarations(symbol),
    ...getSymbolDeclarations(aliasedSymbol),
  ];
  for (const declaration of declarations) {
    const type = asNodeSubject(getNodeField(declaration, "Type") ?? getNodeField(declaration, "type"));
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

function getSymbolForDeclarationLookup(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  node: Node,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (!isSymbolLookupNode(ast, node)) {
    return undefined;
  }
  try {
    return checker.getSymbolAtLocation(node, { sourceFile }) ??
      checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function isSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node) ||
    ast.is.IsVariableDeclaration(node) ||
    ast.is.IsParameterDeclaration(node) ||
    ast.is.IsBindingElement(node) ||
    ast.is.IsFunctionDeclaration(node) ||
    ast.is.IsClassDeclaration(node) ||
    ast.is.IsMethodDeclaration(node) ||
    ast.is.IsPropertyDeclaration(node);
}

function getAliasedSymbolIfAvailable(
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  symbol: ExtensionFactSubject | undefined,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  try {
    return checker.getAliasedSymbol(symbol as Symbol, { sourceFile });
  } catch {
    return undefined;
  }
}

function getSymbolDeclarations(symbol: ExtensionFactSubject | undefined): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

function isTypeLiteralLikeNode(node: Node): boolean {
  return getNodeList(getNodeField(node, "Members")).length > 0 &&
    getNodeField(node, "Name") === undefined &&
    getNodeField(node, "name") === undefined &&
    getNodeField(node, "HeritageClauses") === undefined;
}

function visitStructuralNodes(
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getStructuralChildNodes(node)) {
    visitStructuralNodes(child, visitor, seen);
  }
}

function getStructuralChildNodes(node: Node): readonly Node[] {
  const children: Node[] = [];
  const listFields = ["Statements", "Members", "Parameters", "TypeParameters", "TypeArguments", "Types", "Arguments", "Elements", "Properties", "Declarations"];
  for (const key of listFields) {
    children.push(...getNodeList(getNodeField(node, key)));
  }
  const nodeFields = [
    "Name",
    "name",
    "Body",
    "Type",
    "ElementType",
    "Constraint",
    "Expression",
    "Initializer",
    "Left",
    "Right",
    "ThenStatement",
    "ElseStatement",
    "Statement",
    "DeclarationList",
    "ImportClause",
    "NamedBindings",
    "ModuleSpecifier",
    "TypeName",
  ];
  for (const key of nodeFields) {
    const value = getNodeField(node, key);
    const direct = asNodeSubject(value);
    if (direct !== undefined) {
      children.push(direct);
    }
  }
  return children;
}

function getNodeList(value: unknown): readonly Node[] {
  const nodes = (value as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes;
  return nodes === undefined
    ? []
    : nodes.map(asNodeSubject).filter((node): node is Node => node !== undefined);
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  const record = node as unknown as Record<string, unknown>;
  const exact = Object.prototype.hasOwnProperty.call(record, field) ? record[field] : undefined;
  if (exact !== undefined) {
    return exact;
  }
  const alternate = `${field[0]!.toLowerCase()}${field.slice(1)}`;
  return Object.prototype.hasOwnProperty.call(record, alternate) ? record[alternate] : undefined;
}

function getNodeNameText(node: Node): string {
  const name = asNodeSubject(getNodeField(node, "Name") ?? getNodeField(node, "name"));
  const text = (name as { readonly Text?: unknown; readonly text?: unknown } | undefined)?.Text ??
    (name as { readonly text?: unknown } | undefined)?.text;
  return typeof text === "function" || text === undefined ? "" : String(text);
}

function sourceNameToCsharpMemberName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}
