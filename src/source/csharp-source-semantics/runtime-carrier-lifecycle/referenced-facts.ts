import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
  Symbol,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  isRuntimeCarrierTypeSyntaxNode,
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function getReferencedRuntimeCarrierTargetTypeRef(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
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
  lifecycleContext: { readonly host: RuntimeCarrierLifecycleFactsContext["host"]; readonly compiler?: RuntimeCarrierLifecycleFactsContext["compiler"] },
  symbol: Symbol | undefined,
): TargetTypeRef | undefined {
  const direct = lifecycleContext.host.facts.get(symbol, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  for (const declaration of getSymbolDeclarations(symbol, lifecycleContext.compiler?.checker)) {
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
