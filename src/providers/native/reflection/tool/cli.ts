import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type {
  DotnetProviderTelemetry,
} from "../telemetry.js";
import type {
  DotnetProviderToolResult,
} from "./types.js";

export function runProviderToolCli(
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
