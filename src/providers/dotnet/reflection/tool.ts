import { performance } from "node:perf_hooks";
import {
  ensureProviderToolBuilt,
} from "./tool/build.js";
import {
  runProviderToolCli,
} from "./tool/cli.js";
import {
  resolveDotnetProviderToolPaths,
} from "./tool/path-resolution.js";
import type {
  DotnetProviderToolResult,
  DotnetProviderToolRunner,
  DotnetProviderToolRunnerOptions,
} from "./tool/types.js";
import {
  runProviderToolWorker,
} from "./tool/worker.js";

export type {
  DotnetProviderToolIdentity,
  DotnetProviderToolResolvedPaths,
  DotnetProviderToolResult,
  DotnetProviderToolRunner,
  DotnetProviderToolRunnerOptions,
} from "./tool/types.js";

export {
  referenceDirectoryIdentities,
  referenceIdentities,
} from "./tool/reference-identities.js";

export function createDotnetProviderToolRunner(options: DotnetProviderToolRunnerOptions): DotnetProviderToolRunner {
  const paths = resolveDotnetProviderToolPaths(options);
  return {
    identity: {
      projectPath: paths.projectPath,
      sourceHash: paths.sourceHash,
      dllPath: paths.dllPath,
    },
    run(args: readonly string[]): DotnetProviderToolResult {
      ensureProviderToolBuilt(paths.projectPath, paths.buildRoot, paths.dllPath, options.telemetry);
      const startedAt = performance.now();
      const result = runProviderToolWorker(
        paths.projectPath,
        paths.sourceHash,
        paths.buildRoot,
        paths.dllPath,
        args,
        options.telemetry,
      );
      options.telemetry.toolInvocation("server", performance.now() - startedAt);
      return result;
    },
  };
}

export function createDotnetProviderCliToolRunner(options: DotnetProviderToolRunnerOptions): DotnetProviderToolRunner {
  const paths = resolveDotnetProviderToolPaths(options);
  return {
    identity: {
      projectPath: paths.projectPath,
      sourceHash: paths.sourceHash,
      dllPath: paths.dllPath,
    },
    run(args: readonly string[]): DotnetProviderToolResult {
      ensureProviderToolBuilt(paths.projectPath, paths.buildRoot, paths.dllPath, options.telemetry);
      return runProviderToolCli(paths.dllPath, args, options.telemetry);
    },
  };
}
