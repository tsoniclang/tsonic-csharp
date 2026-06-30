import type {
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
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
    if (name === undefined || !compiler.ast.is.IsIdentifier(name)) {
      return;
    }
    const elementTypeNode = asNodeSubject(getNodeField(typeNode, "ElementType"));
    const elementType = host.getTargetTypeRefForSubject(elementTypeNode, context, { allowSemanticTypeQuery: true, sourceFile });
    if (elementType === undefined) {
      return;
    }
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile) ??
      getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
    const semanticType = compiler.checker.getTypeFromTypeNode(typeNode, { sourceFile }) ??
      compiler.checker.getTypeAtLocation(name, { sourceFile });
    const sourceUses = collectArrayStructuralUsesForSymbol(sourceFile, symbol, lifecycleContext);
    parameters.push({
      parameter: node,
      name,
      typeNode,
      symbol,
      semanticType,
      elementType,
      sourceUses,
      carrierRequirements: carrierRequirementsForArrayStructuralUses(sourceUses, elementType, lifecycleContext, host),
    });
  });
  return parameters;
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
