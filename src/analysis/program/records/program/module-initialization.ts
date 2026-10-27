import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpModuleInitializationIndex } from "../../../../target-model/records/program/module-initialization.js";

export function createCsharpModuleInitializationProducer() {
  const callables = new WeakMap<Node, "public" | "internal">();
  const bindings = new WeakMap<Node, "declaration" | "value">();
  let closed = false;
  const assertOpen = (node?: Node): void => {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Module initialization records cannot change after sealing.", node);
  };
  return Object.freeze({
    callable(node: Node, visibility: "public" | "internal"): void {
      assertOpen(node);
      if (callables.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A module callable is published once.", node);
      callables.set(node, visibility);
    },
    binding(node: Node, initialization: "declaration" | "value"): void {
      assertOpen(node);
      if (bindings.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A module binding is published once.", node);
      bindings.set(node, initialization);
    },
    seal(modules: readonly {
      readonly sourceFile: SourceFile;
      readonly dependencies: readonly SourceFile[];
      readonly required: boolean;
      readonly async: boolean;
    }[], entry: SourceFile | undefined): CsharpModuleInitializationIndex {
      assertOpen();
      const selected = new WeakMap(modules.map(module => [module.sourceFile, Object.freeze(module)] as const));
      closed = true;
      const moduleFor = (sourceFile: SourceFile) => {
        const module = selected.get(sourceFile);
        if (module === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Module initialization requires an admitted source file.", sourceFile);
        return module;
      };
      return Object.freeze({
        moduleInitializationDependencies: Object.freeze({ get: (sourceFile: SourceFile) => moduleFor(sourceFile).dependencies }),
        requiresModuleInitializer: Object.freeze({ get: (sourceFile: SourceFile) => moduleFor(sourceFile).required }),
        asyncModuleInitializer: Object.freeze({ get: (sourceFile: SourceFile) => moduleFor(sourceFile).async }),
        entrypointInitializer: () => entry,
        callableVisibility: Object.freeze({ get: (node: Node) => callables.get(node) }),
        moduleBindingInitialization: Object.freeze({ get: (node: Node) => bindings.get(node) }),
      });
    },
  });
}
