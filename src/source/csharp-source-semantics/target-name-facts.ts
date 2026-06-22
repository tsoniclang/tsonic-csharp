import type {
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpTargetNameFactKey,
} from "../csharp-facts.js";
import {
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  hashString,
} from "./target-ref-utils.js";
import {
  tryCsharpIdentifier,
} from "../../csharp-identifiers.js";

export function recordCsharpTargetNameFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsPrivateIdentifier(node)) {
        return;
      }
      const sourceName = compiler.ast.text(node);
      const targetName = privateIdentifierTargetName(sourceName);
      const fact = { name: targetName };
      const evidence = [{ message: "C# private identifier target name recorded by source-name semantics." }];
      lifecycleContext.host.facts.set(node, csharpTargetNameFactKey, fact, evidence);
      const symbol = compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
        compiler.checker.getResolvedSymbol(node, { sourceFile });
      if (symbol !== undefined) {
        lifecycleContext.host.facts.set(symbol, csharpTargetNameFactKey, fact, evidence);
      }
    });
  }
}

function privateIdentifierTargetName(sourceName: string): string {
  const withoutHash = sourceName.startsWith("#") ? sourceName.slice(1) : sourceName;
  const direct = tryCsharpIdentifier(`_${withoutHash}`);
  return direct ?? `__tsonic_private_${hashString(sourceName)}`;
}
