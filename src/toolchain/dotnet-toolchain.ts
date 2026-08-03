import type { TargetToolchain, TargetToolchainContext, TargetToolchainInput, TargetToolchainResult } from "@tsonic/target-api";

export function createDotnetToolchain(_context: TargetToolchainContext): TargetToolchain {
  return {
    prepare(input: TargetToolchainInput): TargetToolchainResult {
      return {
        diagnostics: [],
        producedArtifacts: input.compileResult.artifacts.map((artifact) => artifact.path),
      };
    },
  };
}
