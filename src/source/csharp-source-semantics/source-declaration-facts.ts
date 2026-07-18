import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import {
  visitAstReaderNodes,
} from "./ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
import {
  csharpProjectSourceFactKey,
} from "../csharp-facts.js";
import {
  createSourceDeclarationObservationContext,
} from "./source-declaration-facts/context.js";
import type {
  SourceDeclarationLifecycleContext,
} from "./source-declaration-facts/context.js";
import {
  recordSourceDeclarationTarget,
} from "./source-declaration-facts/recording.js";
import {
  getCsharpSourceStructDeclarationTargetForSubject,
} from "./source-declaration-facts/struct-declaration.js";
import {
  getEnumMemberTargetType,
  getSourceDeclarationTargetType,
} from "./source-declaration-facts/target-type.js";

export {
  getCsharpSourceStructDeclarationTargetForSubject,
} from "./source-declaration-facts/struct-declaration.js";
export {
  getSourceDeclarationTargetType,
  sourceDeclarationTargetType,
} from "./source-declaration-facts/target-type.js";

export function recordCsharpSourceDeclarationFactsBeforeFinalization(
  lifecycleContext: SourceDeclarationLifecycleContext,
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (
      sourceFile === undefined ||
      sourceFile.IsDeclarationFile === true ||
      lifecycleContext.host.facts.get(sourceFile, providerVirtualDeclarationFactKey) !== undefined
    ) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      lifecycleContext.host.facts.set(node, csharpProjectSourceFactKey, {
        kind: "project-source",
      }, [{ message: "C# project-source ownership recorded from the host-selected non-declaration source file." }]);
      const context = createSourceDeclarationObservationContext(lifecycleContext, compiler);
      const structDeclaration = getCsharpSourceStructDeclarationTargetForSubject(node, context, host);
      if (structDeclaration !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, structDeclaration.targetType, structDeclaration.objectShape);
        return;
      }
      const declarationTarget = getSourceDeclarationTargetType(compiler.ast, node, context, host);
      if (declarationTarget !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, declarationTarget);
        return;
      }
      const enumMemberTarget = getEnumMemberTargetType(compiler.ast, node);
      if (enumMemberTarget !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, enumMemberTarget);
      }
    });
  }
}
