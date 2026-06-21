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
  createCsharpNativeProviderExtension,
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
          createCsharpNativeProviderExtension(context),
        ];
      },
    },
    surfaces: [
      {
        id: "js",
        displayName: "JavaScript compatibility",
        runtimeArtifacts(_context: TargetRuntimeArtifactContext): readonly TargetArtifact[] {
          return [];
        },
      },
      {
        id: "nodejs",
        displayName: "Node.js compatibility",
        requiredSurfaces: ["js"],
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
