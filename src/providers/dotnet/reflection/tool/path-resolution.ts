import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  dotnetProviderToolAssemblyName,
} from "./constants.js";
import { defaultCsharpTargetFramework, parseCsharpTargetFramework } from "../../../../target-model/configuration/framework.js";
import { resolveDotnetProviderToolchain } from "./toolchain.js";
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
  const toolchain = options.toolchain ?? resolveDotnetProviderToolchain(
    options.projectDirectory ?? process.cwd(),
    options.targetFramework ?? defaultCsharpTargetFramework,
  );
  parseCsharpTargetFramework(toolchain.targetFramework);
  if (options.targetFramework !== undefined && options.targetFramework !== toolchain.targetFramework) {
    throw new Error("The provider toolchain does not match its compilation framework.");
  }
  if (options.projectDirectory !== undefined && resolve(options.projectDirectory) !== toolchain.projectDirectory) {
    throw new Error("The provider toolchain does not match its compilation project directory.");
  }
  const toolHash = createHash("sha256").update(JSON.stringify([
    sourceHash, toolchain.sdkRoot, toolchain.sdkVersion, toolchain.toolTargetFramework,
  ])).digest("hex").slice(0, 32);
  const buildRoot = resolve(options.toolBuildRoot, toolHash);
  const dllPath = join(buildRoot, "bin", "Debug", toolchain.toolTargetFramework, dotnetProviderToolAssemblyName);
  return {
    projectPath,
    sourceHash,
    buildRoot,
    dllPath,
    toolchain,
  };
}
