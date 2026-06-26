import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "../telemetry.js";

export function ensureProviderToolBuilt(
  projectPath: string,
  buildRoot: string,
  dllPath: string,
  telemetry: DotnetProviderTelemetry,
): void {
  if (existsSync(dllPath)) {
    return;
  }
  const startedAt = performance.now();
  const result = spawnSync("dotnet", [
    "build",
    projectPath,
    "--nologo",
    "--verbosity",
    "quiet",
    `-p:BaseIntermediateOutputPath=${join(buildRoot, "obj/")}`,
    `-p:BaseOutputPath=${join(buildRoot, "bin/")}`,
  ], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  telemetry.toolBuild(performance.now() - startedAt);
  if (result.status !== 0) {
    throw new Error(`.NET provider tool build failed.\n${result.stdout}\n${result.stderr}`);
  }
  if (!existsSync(dllPath)) {
    throw new Error(`.NET provider tool build did not produce '${dllPath}'.`);
  }
}
