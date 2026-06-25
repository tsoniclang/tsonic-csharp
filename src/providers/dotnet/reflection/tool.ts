import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
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
const workerStartupTimeoutMs = 30_000;
const workerRequestTimeoutMs = 300_000;
const workerPollMs = 10;
const workerSleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const workerSessions = new Map<string, DotnetProviderWorkerSession>();

interface DotnetProviderWorkerSession {
  readonly child: ChildProcess;
  readonly processId: number;
  readonly requestsDir: string;
  readonly responsesDir: string;
}

interface DotnetProviderWorkerResponse {
  readonly id: string;
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

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
      const result = runProviderToolWorker(projectPath, sourceHash, buildRoot, dllPath, args, options.telemetry);
      options.telemetry.toolInvocation("server", performance.now() - startedAt);
      return result;
    },
  };
}

export function createDotnetProviderCliToolRunner(options: DotnetProviderToolRunnerOptions): DotnetProviderToolRunner {
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
      return runProviderToolCli(dllPath, args, options.telemetry);
    },
  };
}

function runProviderToolCli(
  dllPath: string,
  args: readonly string[],
  telemetry: DotnetProviderTelemetry,
): DotnetProviderToolResult {
  const startedAt = performance.now();
  telemetry.toolProcessStart("cli");
  const result = spawnSync("dotnet", [dllPath, ...args], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  telemetry.toolInvocation("cli", performance.now() - startedAt);
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

function runProviderToolWorker(
  projectPath: string,
  sourceHash: string,
  buildRoot: string,
  dllPath: string,
  args: readonly string[],
  telemetry: DotnetProviderTelemetry,
): DotnetProviderToolResult {
  try {
    const session = getProviderToolWorkerSession(projectPath, sourceHash, buildRoot, dllPath, telemetry);
    const requestId = `${process.pid}-${Date.now()}-${randomUUID()}`;
    const requestPath = join(session.requestsDir, `${requestId}.json`);
    const requestTempPath = join(session.requestsDir, `${requestId}.${randomUUID()}.tmp`);
    const responsePath = join(session.responsesDir, `${requestId}.json`);
    writeFileSync(requestTempPath, JSON.stringify({ id: requestId, args }));
    renameSync(requestTempPath, requestPath);
    if (!waitForFile(responsePath, workerRequestTimeoutMs, session.processId)) {
      return {
        status: 1,
        stdout: "",
        stderr: `.NET provider worker did not produce a response for request '${requestId}'.`,
      };
    }
    return readWorkerResponse(responsePath, requestId);
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function getProviderToolWorkerSession(
  projectPath: string,
  sourceHash: string,
  buildRoot: string,
  dllPath: string,
  telemetry: DotnetProviderTelemetry,
): DotnetProviderWorkerSession {
  const sessionKey = JSON.stringify({ projectPath, sourceHash, dllPath });
  const existing = workerSessions.get(sessionKey);
  if (existing !== undefined && isProcessAlive(existing.processId)) {
    return existing;
  }
  const workerRoot = join(buildRoot, "worker", `${process.pid}-${randomUUID()}`);
  const requestsDir = join(workerRoot, "requests");
  const responsesDir = join(workerRoot, "responses");
  const readyFile = join(workerRoot, "ready.json");
  mkdirSync(requestsDir, { recursive: true });
  mkdirSync(responsesDir, { recursive: true });
  const child = spawn("dotnet", [
    dllPath,
    "--server",
    "--requests-dir",
    requestsDir,
    "--responses-dir",
    responsesDir,
    "--ready-file",
    readyFile,
    "--owner-pid",
    String(process.pid),
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  if (child.pid === undefined) {
    throw new Error(".NET provider worker process did not start.");
  }
  child.unref();
  telemetry.toolProcessStart("server");
  if (!waitForFile(readyFile, workerStartupTimeoutMs, child.pid)) {
    throw new Error(".NET provider worker did not become ready.");
  }
  const session = {
    child,
    processId: child.pid,
    requestsDir,
    responsesDir,
  };
  workerSessions.set(sessionKey, session);
  return session;
}

function readWorkerResponse(responsePath: string, requestId: string): DotnetProviderToolResult {
  const raw = readFileSync(responsePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isWorkerResponse(parsed)) {
    return {
      status: 1,
      stdout: "",
      stderr: `.NET provider worker emitted an invalid response for request '${requestId}'.`,
    };
  }
  if (parsed.id !== requestId) {
    return {
      status: 1,
      stdout: "",
      stderr: `.NET provider worker response id '${parsed.id}' did not match request '${requestId}'.`,
    };
  }
  return {
    status: parsed.status,
    stdout: parsed.stdout,
    stderr: parsed.stderr,
  };
}

function isWorkerResponse(value: unknown): value is DotnetProviderWorkerResponse {
  return typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "status" in value &&
    "stdout" in value &&
    "stderr" in value &&
    typeof value.id === "string" &&
    typeof value.status === "number" &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string";
}

function waitForFile(path: string, timeoutMs: number, processId: number): boolean {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() <= deadline) {
    if (existsSync(path)) {
      return true;
    }
    if (!isProcessAlive(processId)) {
      return false;
    }
    sleep(workerPollMs);
  }
  return existsSync(path);
}

function sleep(milliseconds: number): void {
  Atomics.wait(workerSleepBuffer, 0, 0, milliseconds);
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
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
