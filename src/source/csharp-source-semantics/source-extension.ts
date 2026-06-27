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
  csharpSourceSemanticsExtensionId,
} from "./identity.js";
import {
  tsonicCoreSourceExtensionId,
} from "@tsonic/source-core";
import {
  csharpSourceSemanticsModules,
} from "./source-modules.js";
import {
  createCsharpSourceVirtualModulesProvider,
} from "./source-virtual-modules.js";

export function createCsharpSourceSemanticsExtension(_context: TargetProviderContext): CompilerExtension {
  const sourceSemantics = createSourceSemanticsExtension({
    identity: {
      id: csharpSourceSemanticsExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
  return {
    ...sourceSemantics,
    dependencies: {
      dependsOn: [tsonicCoreSourceExtensionId],
      runsAfter: [tsonicCoreSourceExtensionId],
    },
    initialize(extensionContext): void {
      extensionContext.registerTargetBindingProvider(createCsharpSourceVirtualModulesProvider());
      sourceSemantics.initialize?.(extensionContext);
    },
  };
}
