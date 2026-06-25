import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "./telemetry.js";

export interface DotnetProviderToolResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DotnetProviderToolRunner {
  readonly identity: DotnetProviderToolIdentity;
  run(args: readonly string[]): DotnetProviderToolResult;
}

export interface DotnetProviderToolIdentity {
  readonly projectPath: string;
  readonly sourceHash: string;
  readonly dllPath: string;
}

export interface DotnetProviderToolRunnerOptions {
  readonly toolProjectPath: string;
  readonly toolBuildRoot: string;
  readonly telemetry: DotnetProviderTelemetry;
}

const targetFramework = "net10.0";
const toolAssemblyName = "DotnetTypeProvider.dll";

export function createDotnetProviderToolRunner(options: DotnetProviderToolRunnerOptions): DotnetProviderToolRunner {
  const projectPath = resolve(options.toolProjectPath);
  const sourceHash = hashProviderToolSources(projectPath);
  const buildRoot = resolve(options.toolBuildRoot, sourceHash);
  const dllPath = join(buildRoot, "bin", "Debug", targetFramework, toolAssemblyName);
  return {
    identity: {
      projectPath,
      sourceHash,
      dllPath,
    },
    run(args: readonly string[]): DotnetProviderToolResult {
      ensureProviderToolBuilt(projectPath, buildRoot, dllPath, options.telemetry);
      const startedAt = performance.now();
      const result = spawnSync("dotnet", [dllPath, ...args], {
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
      });
      options.telemetry.toolInvocation("cli", performance.now() - startedAt);
      return {
        status: result.status,
        stdout: String(result.stdout),
        stderr: String(result.stderr),
      };
    },
  };
}

function ensureProviderToolBuilt(
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

function hashProviderToolSources(projectPath: string): string {
  const root = dirname(projectPath);
  const hash = createHash("sha256");
  for (const file of providerToolSourceFiles(root)) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 32);
}

function providerToolSourceFiles(root: string): readonly string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "bin" || entry.name === "obj" || entry.name === ".temp") {
      continue;
    }
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...providerToolSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".csproj"))) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

export function referenceIdentities(references: readonly string[]): readonly Readonly<Record<string, unknown>>[] {
  return references.map((reference) => {
    const resolved = resolve(reference);
    if (!existsSync(resolved)) {
      return {
        path: resolved,
        exists: false,
      };
    }
    const stat = statSync(resolved);
    return {
      path: resolved,
      exists: true,
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
    };
  });
}
