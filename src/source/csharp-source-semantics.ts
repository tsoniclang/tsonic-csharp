import {
  ExtensionLifecycleEvent,
  createSourceSemanticsExtension,
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CompilerExtension,
  ExtensionObservationContext,
  ExtensionFactStore,
  ExtensionFactSubject,
  Node,
  SourceFile,
  BeforeSemanticsFinalizedLifecycleRequest,
  SourceFileBoundLifecycleRequest,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type { TargetProviderContext } from "@tsonic/target-api";
import {
  csharpObjectShapeFactKey,
} from "./csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "./csharp-facts.js";
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
  getCsharpOperatorTargetOperation,
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
} from "./csharp-source-semantics/target-rules.js";
import { csharpSourceSemanticsModules } from "./csharp-source-semantics/source-modules.js";
import { targetOperation } from "./csharp-source-semantics/operations.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitStructuralNodes,
} from "./csharp-source-semantics/ast-utils.js";
import type { TargetTypeRefResolutionOptions } from "./csharp-source-semantics/target-member-selection.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./csharp-source-semantics/operator-syntax.js";
import {
  getObjectShapeTargetName,
} from "./csharp-source-semantics/object-shape-identity.js";
import {
  getSymbolForDeclarationLookup,
} from "./csharp-source-semantics/symbol-utils.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./csharp-source-semantics/surfaces/nodejs/index.js";
import {
  createCsharpOperationsProvider,
  getCheckedOperatorOperandQuery,
  getCsharpOperatorResultTypeRefForOperator,
  getLiteralTargetTypeRefForKnownOperatorOperand,
} from "./csharp-source-semantics/operations-provider.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
  getRuntimeCarrierSubjectType,
  mapRuntimeCarrier as mapCsharpRuntimeCarrier,
  recordCsharpRuntimeCarrierFactsBeforeFinalization,
} from "./csharp-source-semantics/runtime-carriers.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./csharp-source-semantics/runtime-carriers.js";
import {
  resolveFunctionTargetTypeRefFromSignatureLikeSubject,
  resolveTargetTypeArgumentsForType,
  resolveTargetTypeRefForSubject,
  resolveTargetTypeRefForType,
} from "./csharp-source-semantics/target-type-resolution.js";
import type {
  CsharpSemanticTypeDeclarationShape,
  CsharpTargetTypeResolutionHost,
} from "./csharp-source-semantics/target-type-resolution.js";
import {
  getCsharpObjectShapeFactForSubject as resolveCsharpObjectShapeFactForSubject,
  getRecordedCsharpObjectShapeFactForSubject as resolveRecordedCsharpObjectShapeFactForSubject,
  getSemanticTypeDeclarationShape as resolveSemanticTypeDeclarationShape,
  getTargetTypeRefForSyntaxNode as resolveTargetTypeRefForSyntaxNode,
  recordCsharpSourceFileFacts,
} from "./csharp-source-semantics/object-shape-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./csharp-source-semantics/object-shape-facts.js";
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

const targetTypeResolutionHost = {
  getCsharpObjectShapeFactForSubject,
  getSemanticTypeDeclarationShape,
} satisfies CsharpTargetTypeResolutionHost;

const objectShapeSemanticsHost = {
  getTargetTypeRefForSubject,
  getTargetTypeRefForType,
  getFunctionTargetTypeRefFromSignatureLikeSubject: (
    node: Node,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => resolveFunctionTargetTypeRefFromSignatureLikeSubject(node, context, options, targetTypeResolutionHost),
  getTargetTypeArgumentsForType: (
    type: Type,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => resolveTargetTypeArgumentsForType(type, context, options, targetTypeResolutionHost),
} satisfies CsharpObjectShapeSemanticsHost;

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
      const runtimeCarrierHost = {
        getTargetTypeRefForSubject,
        getTargetTypeRefForType,
        getTargetTypeRefForSyntaxNode,
        getCsharpObjectShapeFactForSubject,
        getRecordedCsharpObjectShapeFactForSubject,
      } satisfies CsharpRuntimeCarrierSemanticsHost;
      const provider = createCsharpOperationsProvider(selectedSurfaceIds, {
        getTargetTypeRefForSubject,
        getCsharpObjectShapeFactForSubject,
        mapRuntimeCarrier: (request, observationContext) => mapCsharpRuntimeCarrier(request, observationContext, runtimeCarrierHost),
      });
      context.registerTargetSemanticProvider(provider);
      context.registerLifecycleHook<SourceFileBoundLifecycleRequest>(ExtensionLifecycleEvent.afterSourceFileBound, (request, lifecycleContext) => {
        recordCsharpSourceFileFacts(request, context.facts, lifecycleContext.compiler?.ast);
      });
      context.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext);
        recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(lifecycleContext);
        recordCsharpCheckedOperatorFactsBeforeFinalization(lifecycleContext);
        recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, selectedSurfaceIds, runtimeCarrierHost);
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

function getTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForSubject(subject, context, options, targetTypeResolutionHost);
}

function getTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForType(type, context, options, targetTypeResolutionHost);
}

function getTargetTypeRefForSyntaxNode(
  node: Node | undefined,
  facts: ExtensionFactStore,
  ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForSyntaxNode(node, facts, ast);
}

function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  return resolveCsharpObjectShapeFactForSubject(subject, context, objectShapeSemanticsHost);
}

function getRecordedCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  return resolveRecordedCsharpObjectShapeFactForSubject(subject, context);
}

function getSemanticTypeDeclarationShape(
  type: Type,
  context: ExtensionObservationContext,
): CsharpSemanticTypeDeclarationShape | undefined {
  return resolveSemanticTypeDeclarationShape(type, context, objectShapeSemanticsHost);
}
