import {
  ExtensionLifecycleEvent,
  ExtensionObservationPoint,
  TstsProviderContractVersion,
  acceptObservation,
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
  ProviderIdentity,
  ParameterPassingRequest,
  ParameterPassingResult,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  BeforeSemanticsFinalizedLifecycleRequest,
  SourceFileBoundLifecycleRequest,
  SourcePrimitiveKind,
  TargetConstraint,
  TargetMember,
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
  csharpNativeProviderExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./csharp-source-semantics/identity.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./csharp-source-semantics/target-types.js";
import {
  getCsharpConversionOperation,
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isCsharpStringType,
  isIntegralTargetTypeRef,
  isVoidTargetType,
  sourcePrimitiveRuntimeKind,
  unwrapNullableTargetType,
} from "./csharp-source-semantics/target-rules.js";
import { csharpSourceSemanticsModules } from "./csharp-source-semantics/source-modules.js";
import {
  findTargetBinding,
  getKnownTargetBindingForTypeRef,
  resolveTargetBinding,
} from "./csharp-source-semantics/provider-bindings.js";
import {
  targetOperation,
  targetOperationFromMember,
} from "./csharp-source-semantics/operations.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  getNodeNameText,
  getStructuralChildNodes,
  isTypeLiteralLikeNode,
  isTypeSyntaxNode,
  visitStructuralNodes,
} from "./csharp-source-semantics/ast-utils.js";
import {
  asTargetParameter,
  asTargetTypeRef,
  asType,
  sourceNameToCsharpMemberName,
  targetTypeRefEquals,
} from "./csharp-source-semantics/target-ref-utils.js";
import {
  findTargetMember,
  findTargetMemberForCall,
  isLiteralRepresentableAsTargetType,
  selectTargetMember,
} from "./csharp-source-semantics/target-member-selection.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./csharp-source-semantics/operator-syntax.js";
import {
  getTypeofComparisonOperation,
  getTypeofRuntimeKind,
} from "./csharp-source-semantics/typeof-operators.js";
import {
  erasedSourceSemanticsMember,
  isCheckedAttributeBuilderCall,
  isErasedSourceSemanticsCall,
} from "./csharp-source-semantics/erased-source-markers.js";
import {
  getObjectShapeTargetName,
} from "./csharp-source-semantics/object-shape-identity.js";
import {
  getDeclarationTypeNode,
  getSymbolDeclarations,
  getSymbolForDeclarationLookup,
} from "./csharp-source-semantics/symbol-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./csharp-source-semantics/target-member-selection.js";
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
const checkedOperationSyntaxFactQuery = { allowSemanticTypeQuery: false } satisfies TargetTypeRefResolutionOptions;

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
  return isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)
    ? compiler.checker.getTypeFromTypeNode(node, { sourceFile }) ?? compiler.checker.getTypeAtLocation(node, { sourceFile })
    : compiler.checker.getTypeAtLocation(node, { sourceFile });
}

function getRuntimeCarrierSubjectSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Symbol | undefined {
  return compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(node, { sourceFile });
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
    isLiteralRepresentableAsTargetType,
    selectTargetMember: (
      candidates: readonly TargetMember[],
      arguments_: readonly ExtensionFactSubject[],
      context: ExtensionObservationContext,
    ) =>
      selectTargetMember(candidates, arguments_, context, getTargetTypeRefForSubject),
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
      getTargetTypeRefForSubject(request.calleeReceiver, context, checkedOperationSyntaxFactQuery),
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
    getTargetTypeRefForSubject,
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
      getTargetTypeRefForSubject(request.receiver, context, checkedOperationSyntaxFactQuery),
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
      getTargetTypeRefForSubject(request.receiver, context, checkedOperationSyntaxFactQuery),
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
  if (!isIntegralTargetTypeRef(indexType) && !isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
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
  return operator === "??" ? {} : checkedOperationSyntaxFactQuery;
}

function getLiteralTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const unwrappedExpected = unwrapNullableTargetType(expectedOperandType);
  return unwrappedExpected !== undefined && isLiteralRepresentableAsTargetType(unwrappedExpected, operand, context)
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
  if (isLiteralRepresentableAsTargetType(target, request.source, context)) {
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
