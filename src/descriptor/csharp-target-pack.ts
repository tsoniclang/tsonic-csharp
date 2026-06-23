import type {
  TargetArtifact,
  TargetBackend,
  TargetBackendContext,
  TargetPack,
  TargetProviderContext,
  TargetRuntimeArtifactContext,
  TargetToolchain,
  TargetToolchainContext,
} from "@tsonic/target-api";
import type { CompilerExtension } from "@tsonic/tsts";
import { createCsharpBackend } from "../backend/csharp-backend.js";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpJsSurfaceExtension,
  createCsharpNodejsSurfaceExtension,
  createCsharpSourceSemanticsExtension,
} from "../source/csharp-source-semantics.js";
import { createDotnetToolchain } from "../toolchain/dotnet-toolchain.js";

export const csharpTargetId = "csharp";

export function createCsharpTargetPack(): TargetPack {
  return {
    id: csharpTargetId,
    displayName: "C#",
    provider: {
      id: "csharp-provider",
      displayName: "C# target provider",
      createExtensions(context: TargetProviderContext): readonly CompilerExtension[] {
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
        runtimeArtifacts(_context: TargetRuntimeArtifactContext): readonly TargetArtifact[] {
          return [];
        },
      },
      {
        id: "nodejs",
        displayName: "Node.js surface",
        requiredSurfaces: ["js"],
        createExtensions(context) {
          return [createCsharpNodejsSurfaceExtension(context)];
        },
        runtimeArtifacts(_context: TargetRuntimeArtifactContext): readonly TargetArtifact[] {
          return [];
        },
      },
    ],
    createBackend(context: TargetBackendContext): TargetBackend {
      return createCsharpBackend(context);
    },
    createToolchain(context: TargetToolchainContext): TargetToolchain {
      return createDotnetToolchain(context);
    },
  };
}
