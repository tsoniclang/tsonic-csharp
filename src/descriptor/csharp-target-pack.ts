import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
const targetPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
            csharpRuntimeAssemblyReference("csharp-runtime", "Tsonic.CSharp.Runtime"),
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
              csharpRuntimeAssemblyReference("csharp-js", "Tsonic.CSharp.Js"),
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

function csharpRuntimeAssemblyReference(repositoryName: string, assemblyName: string): TargetRuntimeReference {
  return {
    kind: "assembly",
    include: assemblyName,
    attributes: {
      HintPath: resolve(targetPackageRoot, `../${repositoryName}/runtimes/net10.0/${assemblyName}.dll`),
    },
  };
}

function csharpTypescriptCompatibilityRuntimeReferences(context: TargetRuntimeContributionContext): readonly TargetRuntimeReference[] {
  if (readCsharpTypescriptCompatibilityMode(context.target) !== "compat" || context.selectedSurfaces.some((surface) => surface.id === "js")) {
    return [];
  }
  return [csharpRuntimeAssemblyReference("csharp-js", "Tsonic.CSharp.Js")];
}
