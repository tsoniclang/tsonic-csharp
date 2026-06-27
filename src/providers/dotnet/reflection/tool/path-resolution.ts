import { join, resolve } from "node:path";
import {
  dotnetProviderToolAssemblyName,
  dotnetProviderToolTargetFramework,
} from "./constants.js";
import {
  hashProviderToolSources,
} from "./source-hash.js";
import type {
  DotnetProviderToolResolvedPaths,
  DotnetProviderToolRunnerOptions,
} from "./types.js";

export function resolveDotnetProviderToolPaths(
  options: DotnetProviderToolRunnerOptions,
): DotnetProviderToolResolvedPaths {
  const projectPath = resolve(options.toolProjectPath);
  const sourceHash = hashProviderToolSources(projectPath);
  const buildRoot = resolve(options.toolBuildRoot, sourceHash);
  const dllPath = join(buildRoot, "bin", "Debug", dotnetProviderToolTargetFramework, dotnetProviderToolAssemblyName);
  return {
    projectPath,
    sourceHash,
    buildRoot,
    dllPath,
  };
}
