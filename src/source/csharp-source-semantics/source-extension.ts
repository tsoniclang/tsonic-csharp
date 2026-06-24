import {
  createSourceSemanticsExtension,
} from "@tsonic/tsts";
import type {
  CompilerExtension,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
} from "@tsonic/target-api";
import {
  csharpProviderVersion,
} from "./identity.js";
import {
  csharpSourceSemanticsModules,
} from "./source-modules.js";
import {
  createCsharpSourceVirtualModulesProvider,
} from "./source-virtual-modules.js";

export function createCsharpSourceSemanticsExtension(_context: TargetProviderContext): CompilerExtension {
  const sourceSemantics = createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
  return {
    ...sourceSemantics,
    initialize(extensionContext): void {
      extensionContext.registerTargetBindingProvider(createCsharpSourceVirtualModulesProvider());
      sourceSemantics.initialize?.(extensionContext);
    },
  };
}
