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

export function createCsharpSourceSemanticsExtension(_context: TargetProviderContext): CompilerExtension {
  return createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
}
