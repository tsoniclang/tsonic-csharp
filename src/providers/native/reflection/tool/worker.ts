import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "../telemetry.js";
import type {
  DotnetProviderToolResult,
} from "./types.js";

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

export function runProviderToolWorker(
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
