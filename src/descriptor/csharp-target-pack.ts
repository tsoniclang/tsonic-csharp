import type {
  TargetPack,
  TargetToolchain,
  TargetToolchainContext,
} from "@tsonic/target-api";
import {
  createCsharpCompilationSession,
  csharpTargetProvider,
  csharpTargetSurfaces,
} from "../compilation/index.js";
import { createDotnetToolchain } from "../toolchain/dotnet-toolchain.js";
import { csharpTargetId } from "../target-model/identities/source.js";

export function createCsharpTargetPack(): TargetPack {
  return Object.freeze({
    id: csharpTargetId,
    displayName: "C#",
    provider: csharpTargetProvider,
    surfaces: csharpTargetSurfaces,
    createCompilationSession: createCsharpCompilationSession,
    createToolchain(context: TargetToolchainContext): TargetToolchain {
      return createDotnetToolchain(context);
    },
  });
}
