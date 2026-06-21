import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "./ast-utils.js";
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
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
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

function targetTypeRefContainsSourcePrimitive(type: TargetTypeRef): boolean {
  switch (type.kind) {
    case "source-primitive":
      return true;
    case "array":
      return targetTypeRefContainsSourcePrimitive(type.element);
    case "tuple":
      return type.elements.some(targetTypeRefContainsSourcePrimitive);
    case "target-named":
      return (type.typeArguments ?? []).some(targetTypeRefContainsSourcePrimitive);
    case "pointer":
      return targetTypeRefContainsSourcePrimitive(type.pointee);
    case "function-pointer":
      return targetTypeRefContainsSourcePrimitive(type.result) ||
        type.args.some(targetTypeRefContainsSourcePrimitive);
    default:
      return false;
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
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const catchVariableCarrier = getCatchVariableTargetTypeRef(node, context);
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
