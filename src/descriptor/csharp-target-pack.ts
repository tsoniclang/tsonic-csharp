import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import type {
  TargetBackend,
  TargetBackendContext,
  TargetPack,
  TargetProviderContext,
  TargetRuntimeContributionContext,
  TargetRuntimeContributions,
  TargetRuntimeReference,
  TargetToolchain,
  TargetToolchainContext,
} from "@tsonic/target-api";
import type { CompilerExtension } from "@tsonic/tsts";
import { createCsharpBackend } from "../backend/csharp-backend.js";
import {
  readCsharpTypescriptCompatibilityMode,
  validateCsharpTargetOptions,
} from "../options/csharp-target-options.js";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpJsSurfaceExtension,
} from "../source/csharp-source-semantics.js";
import { createDotnetToolchain } from "../toolchain/dotnet-toolchain.js";

export const csharpTargetId = "csharp";
const require = createRequire(import.meta.url);

export function createCsharpTargetPack(): TargetPack {
  return {
    id: csharpTargetId,
    displayName: "C#",
    provider: {
      id: "csharp-provider",
      displayName: "C# target provider",
      createExtensions(context: TargetProviderContext): readonly CompilerExtension[] {
        validateCsharpTargetOptions(context.target);
        return [
          createCsharpSourceSemanticsExtension(context),
          createCsharpTargetSemanticsExtension(context),
        ];
      },
      runtimeContributions(context: TargetRuntimeContributionContext): TargetRuntimeContributions {
        return {
          references: [
            csharpRuntimeAssemblyReference(context, "@tsonic/csharp-runtime", "Tsonic.CSharp.Runtime"),
            ...csharpTypescriptCompatibilityRuntimeReferences(context),
          ],
        };
      },
    },
    surfaces: [
      {
        id: "js",
        displayName: "JavaScript surface",
        createExtensions(context) {
          return [createCsharpJsSurfaceExtension(context)];
        },
        runtimeContributions(_context: TargetRuntimeContributionContext): TargetRuntimeContributions {
          return {
            references: [
              csharpRuntimeAssemblyReference(_context, "@tsonic/csharp-js", "Tsonic.CSharp.Js"),
            ],
          };
        },
      },
    ],
    createBackend(context: TargetBackendContext): TargetBackend {
      validateCsharpTargetOptions(context.target);
      return createCsharpBackend(context);
    },
    createToolchain(context: TargetToolchainContext): TargetToolchain {
      validateCsharpTargetOptions(context.target);
      return createDotnetToolchain(context);
    },
  };
}

function csharpRuntimeAssemblyReference(
  context: TargetRuntimeContributionContext,
  packageName: string,
  assemblyName: string,
): TargetRuntimeReference {
  const packageRoot = resolveRuntimePackageRoot(context, packageName);
  return {
    kind: "assembly",
    include: assemblyName,
    attributes: {
      HintPath: resolve(packageRoot, `runtimes/net10.0/${assemblyName}.dll`),
    },
  };
}

function resolveRuntimePackageRoot(context: TargetRuntimeContributionContext, packageName: string): string {
  const packageJsonSpecifier = `${packageName}/package.json`;
  const projectRequire = createRequire(resolve(context.paths.projectRoot, "package.json"));
  for (const resolver of [projectRequire, require]) {
    try {
      return dirname(resolver.resolve(packageJsonSpecifier));
    } catch {
      continue;
    }
  }
  throw new Error(`Required C# runtime package '${packageName}' is not installed or does not export package.json.`);
}

function csharpTypescriptCompatibilityRuntimeReferences(context: TargetRuntimeContributionContext): readonly TargetRuntimeReference[] {
  if (readCsharpTypescriptCompatibilityMode(context.target) !== "compat" || context.selectedSurfaces.some((surface) => surface.id === "js")) {
    return [];
  }
  return [csharpRuntimeAssemblyReference(context, "@tsonic/csharp-js", "Tsonic.CSharp.Js")];
}
