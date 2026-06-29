import { existsSync, mkdirSync, rmdirSync } from "node:fs";
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
  const lock = acquireProviderToolBuildLock(buildRoot, dllPath);
  if (lock.kind === "waited") {
    return;
  }
  const startedAt = performance.now();
  try {
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
  } finally {
    lock.release();
  }
}

type ProviderToolBuildLock =
  | { readonly kind: "acquired"; readonly release: () => void }
  | { readonly kind: "waited" };

function acquireProviderToolBuildLock(buildRoot: string, dllPath: string): ProviderToolBuildLock {
  mkdirSync(buildRoot, { recursive: true });
  const lockDirectory = join(buildRoot, ".build.lock");
  const startedAt = performance.now();
  while (true) {
    if (existsSync(dllPath)) {
      return { kind: "waited" };
    }
    try {
      mkdirSync(lockDirectory, { recursive: false });
      return {
        kind: "acquired",
        release() {
          rmdirSync(lockDirectory);
        },
      };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      if (performance.now() - startedAt > 120_000) {
        throw new Error(`Timed out waiting for .NET provider tool build lock at '${lockDirectory}'.`);
      }
      sleepSync(50);
    }
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "EEXIST";
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
