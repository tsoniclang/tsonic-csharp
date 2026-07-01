import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "../../../operations-provider.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import {
  carrierRequirementsForArrayStructuralUses,
  collectArrayStructuralUsesForSymbol,
} from "./structural-uses.js";
import type {
  ArrayParameterAnalysis,
  ArrayLocalAnalysis,
  ArrayReturnAnalysis,
  CsharpArrayCarrierRequirement,
  LifecycleContext,
} from "./types.js";
import {
  isSourceStandardLibraryArrayLikeType,
} from "../../../source-type-classification.js";
import {
  getCsharpArrayLiteralElementTargetType,
  getCsharpCollectionElementTargetType,
} from "../../../target-types.js";

export function collectArrayParameters(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayParameterAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const parameters: ArrayParameterAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsParameterDeclaration(node)) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    if (typeNode === undefined || !compiler.ast.is.IsArrayTypeNode(typeNode)) {
      return;
    }
    const name = asNodeSubject(getNodeField(node, "name"));
    if (name === undefined || (!compiler.ast.is.IsIdentifier(name) && compiler.ast.kindName(name) !== "KindArrayBindingPattern")) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    const nameIsIdentifier = compiler.ast.is.IsIdentifier(name);
    const symbol = nameIsIdentifier
      ? getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
        getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile)
      : undefined;
    const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(name, { sourceFile });
    const sourceUses = nameIsIdentifier
      ? collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext)
      : [];
    parameters.push({
      parameter: node,
      name,
      typeNode,
      symbol,
      semanticType,
      elementType,
      sourceUses,
      carrierRequirements: nameIsIdentifier
        ? carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host)
        : carrierRequirementsForArrayBindingPattern(name),
    });
  });
  return parameters;
}

function carrierRequirementsForArrayBindingPattern(pattern: Node): ReadonlySet<CsharpArrayCarrierRequirement> {
  const requirements = new Set<CsharpArrayCarrierRequirement>();
  for (const element of getNodeList(getNodeField(pattern, "Elements"))) {
    requirements.add("index-read");
    if (asNodeSubject(getNodeField(element, "Initializer")) !== undefined || asNodeSubject(getNodeField(element, "DotDotDotToken")) !== undefined) {
      requirements.add("length-read");
    }
  }
  return requirements;
}

export function collectArrayReturnTypeNodes(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayReturnAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const returns: ArrayReturnAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    const kind = compiler.ast.kindName(node);
    if (
      kind !== "KindFunctionDeclaration" &&
      kind !== "KindMethodDeclaration" &&
      kind !== "KindArrowFunction" &&
      kind !== "KindFunctionExpression"
    ) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    if (typeNode === undefined || !compiler.ast.is.IsArrayTypeNode(typeNode)) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    returns.push({ typeNode, elementType });
  });
  return returns;
}

export function collectArrayLocalDeclarations(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): readonly ArrayLocalAnalysis[] {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return [];
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const locals: ArrayLocalAnalysis[] = [];
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    if (!compiler.ast.is.IsVariableDeclaration(node)) {
      const bindingElement = collectArrayBindingElementLocal(node, sourceFile, lifecycleContext, context, host);
      if (bindingElement !== undefined) {
        locals.push(bindingElement);
      }
      return;
    }
    const initializer = asNodeSubject(getNodeField(node, "Initializer"));
    const name = asNodeSubject(getNodeField(node, "name"));
    if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
      return;
    }
    const semanticType = compiler.checker.getTypeAtLocation(name, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(initializer, { sourceFile });
    if (semanticType === undefined || !isSourceStandardLibraryArrayLikeType(semanticType, context)) {
      return;
    }
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    const elementType = getArrayElementTypeFromLocalDeclaration(typeNode, semanticType, sourceFile, context, host);
    if (elementType === undefined) {
      return;
    }
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
      getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
    const sourceUses = collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext);
    locals.push({
      declaration: node,
      name,
      ...(initializer === undefined ? {} : { initializer }),
      ...(typeNode === undefined ? {} : { typeNode }),
      symbol,
      semanticType,
      elementType,
      sourceUses,
      carrierRequirements: carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host),
    });
  });
  return locals;
}

function collectArrayBindingElementLocal(
  node: Node,
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
): ArrayLocalAnalysis | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindBindingElement") {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(node, "name"));
  if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
    return undefined;
  }
  const semanticType = compiler.checker.getTypeAtLocation(name, { sourceFile });
  if (semanticType === undefined || !isSourceStandardLibraryArrayLikeType(semanticType, context)) {
    return undefined;
  }
  const targetType = host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  const elementType = targetType?.kind === "array"
    ? targetType.element
    : getCsharpArrayLiteralElementTargetType(targetType) ??
      getCsharpCollectionElementTargetType(targetType);
  if (elementType === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
    getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  const sourceUses = collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext);
  return {
    declaration: node,
    name,
    symbol,
    semanticType,
    elementType,
    sourceUses,
    carrierRequirements: carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host),
  };
}

function getArrayElementTypeFromLocalDeclaration(
  typeNode: ReturnType<typeof asNodeSubject>,
  semanticType: ReturnType<NonNullable<LifecycleContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  sourceFile: SourceFile,
  context: ReturnType<typeof createRuntimeCarrierLifecycleObservationContext>,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject" | "getTargetTypeRefForType">,
) {
  const compiler = context.compiler;
  if (typeNode !== undefined && compiler?.ast.is.IsArrayTypeNode(typeNode) === true) {
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    return elementType;
  }
  const targetType = host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  return targetType?.kind === "array"
    ? targetType.element
    : getCsharpArrayLiteralElementTargetType(targetType) ??
      getCsharpCollectionElementTargetType(targetType);
}
