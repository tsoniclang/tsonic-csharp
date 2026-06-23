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
  validateCsharpTargetOptions,
} from "../options/csharp-target-options.js";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpJsSurfaceExtension,
  createCsharpNodejsSurfaceExtension,
  createCsharpSourceSemanticsExtension,
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
              csharpRuntimeProjectReference("csharp-runtime", "Tsonic.CSharp.Runtime"),
              csharpRuntimeProjectReference("csharp-js", "Tsonic.CSharp.Js"),
            ],
          };
        },
      },
      {
        id: "nodejs",
        displayName: "Node.js surface",
        requiredSurfaces: ["js"],
        createExtensions(context) {
          return [createCsharpNodejsSurfaceExtension(context)];
        },
        runtimeContributions(_context: TargetRuntimeContributionContext): TargetRuntimeContributions {
          return {
            references: [
              csharpRuntimeProjectReference("csharp-nodejs", "Tsonic.CSharp.Node"),
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

function csharpRuntimeProjectReference(repositoryName: string, assemblyName: string): TargetRuntimeReference {
  return {
    kind: "project",
    include: resolve(targetPackageRoot, `../${repositoryName}/src/${assemblyName}/${assemblyName}.csproj`),
  };
}
