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
  collectArrayUsesForSymbol,
} from "./use-classification.js";
import type {
  ArrayParameterAnalysis,
  ArrayReturnAnalysis,
  LifecycleContext,
} from "./types.js";

export function collectArrayParameters(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
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
    parameters.push({
      parameter: node,
      name,
      typeNode,
      symbol,
      semanticType,
      elementType,
      uses: collectArrayUsesForSymbol(sourceFile, symbol, lifecycleContext),
    });
  });
  return parameters;
}

export function collectArrayReturnTypeNodes(
  sourceFile: SourceFile,
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
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
