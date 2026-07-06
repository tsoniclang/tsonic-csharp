import {
  providerVirtualDeclarationFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  Node,
  SourceFile,
  TargetBindingFact,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
} from "./symbol-utils.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";

export function recordCsharpProviderTargetBindingFactsBeforeFinalization(
  lifecycleContext: ExtensionLifecycleContext,
  host: CsharpTargetTypeResolutionHost,
): void {
  const compiler = lifecycleContext.compiler;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.kindName(node) !== "KindTypeReference") {
        return;
      }
      const binding = getCsharpProviderTargetBindingForTypeReference(node, sourceFile, lifecycleContext, host);
      if (binding === undefined || lifecycleContext.host.facts.get(node, targetBindingFactKey) !== undefined) {
        return;
      }
      lifecycleContext.host.facts.set(node, targetBindingFactKey, binding, [{
        message: "C# provider target binding fact attached to a TSTS-selected type reference from provider virtual declaration identity.",
      }]);
    });
  }
}

function getCsharpProviderTargetBindingForTypeReference(
  node: Node,
  sourceFile: SourceFile,
  lifecycleContext: ExtensionLifecycleContext,
  host: CsharpTargetTypeResolutionHost,
): TargetBindingFact | undefined {
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (typeName === undefined) {
    return undefined;
  }
  const checker = lifecycleContext.compiler.checker;
  const symbol = checker.getSymbolAtLocation(typeName, { sourceFile });
  const resolvedSymbol = checker.getResolvedSymbol(typeName, { sourceFile });
  const aliasedSymbol = getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
  const aliasedResolvedSymbol = getAliasedSymbolIfAvailable(checker, resolvedSymbol, sourceFile);
  const subjects = [typeName, symbol, aliasedSymbol, resolvedSymbol, aliasedResolvedSymbol];
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const virtualDeclaration = lifecycleContext.host.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    const targetIdentity = virtualDeclaration?.targetIdentity;
    if (targetIdentity?.kind !== "target-named") {
      continue;
    }
    const binding = host.getCsharpTargetBindingByTargetId(targetIdentity.id);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}
