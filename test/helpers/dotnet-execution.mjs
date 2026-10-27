import childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { after } from "node:test";
import { guardCgroupPath } from "../../../tsonic/test/scripts/guard-cgroup.mjs";

const compilerServers = new Map();

export function buildDotnetProject(project, argumentsList = [], options = {}) {
  const context = compilerServer(options);
  const childJobs = process.env.TSONIC_TEST_CHILD_JOBS;
  if (!/^[1-9][0-9]*$/u.test(childJobs ?? "")) {
    throw new Error("Native test builds require an explicit positive child-job budget.");
  }
  return childProcess.spawnSync("dotnet", ["build", project, ...argumentsList,
    `--maxcpucount:${childJobs}`, "-nr:false", "-p:UseSharedCompilation=true",
    `-p:SharedCompilationId=${context.pipeName}`], {
    ...options,
    env: nativeEnvironment(options.env),
  });
}

export function executeDotnetProject(project, argumentsList = [], options = {}) {
  const built = buildDotnetProject(project, argumentsList, options);
  if (built.status !== 0) return built;
  return childProcess.spawnSync("dotnet", ["run", "--project", project,
    ...argumentsList, "--no-build", "--no-restore"], {
    ...options,
    env: nativeEnvironment(options.env),
  });
}

export function closeDotnetCompilerServers() {
  const failures = [];
  for (const [identity, context] of compilerServers) {
    compilerServers.delete(identity);
    try {
      assertGuardContainsProcess(context.guard);
      const stopped = childProcess.spawnSync("dotnet", [context.compiler,
        "-shutdown", `-pipename:${context.pipeName}`], {
        cwd: context.cwd,
        env: context.environment,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1_048_576,
      });
      if (stopped.status !== 0) {
        throw new Error(`Owned C# compiler server shutdown failed: ${stopped.error ?? ""}\n${stopped.stdout ?? ""}\n${stopped.stderr ?? ""}`);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length !== 0) {
    throw new AggregateError(failures, "Owned C# compiler servers did not all shut down.");
  }
}

function compilerServer(options) {
  const guard = process.env.TSONIC_TEST_GUARD_CGROUP;
  assertGuardContainsProcess(guard);
  const cwd = resolve(options.cwd ?? process.cwd());
  const environment = nativeEnvironment(options.env);
  const version = nativeSdkText(["--version"], cwd, environment).trim();
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/u.test(version)) {
    throw new Error("The selected native SDK did not publish one exact version.");
  }
  const identity = JSON.stringify([guard, cwd, environment.PATH, environment.DOTNET_ROOT, version]);
  const existing = compilerServers.get(identity);
  if (existing !== undefined) return existing;
  const sdks = nativeSdkText(["--list-sdks"], cwd, environment);
  const selected = sdks.split(/\r?\n/u).map(line => /^(\S+) \[(.+)\]$/u.exec(line))
    .filter(match => match?.[1] === version);
  if (selected.length !== 1) {
    throw new Error("The selected native SDK must identify exactly one compiler installation.");
  }
  const compiler = join(selected[0][2], version, "Roslyn", "bincore", "VBCSCompiler.dll");
  if (!existsSync(compiler)) {
    throw new Error("The selected native SDK has no compiler server executable.");
  }
  const context = Object.freeze({
    compiler,
    cwd,
    environment,
    guard,
    pipeName: `ts-${randomBytes(12).toString("base64url")}`,
  });
  compilerServers.set(identity, context);
  return context;
}

function nativeEnvironment(overrides) {
  return {
    ...process.env,
    ...overrides,
    MSBUILDDISABLENODEREUSE: "1",
    DOTNET_CLI_USE_MSBUILD_SERVER: "0",
    UseSharedCompilation: "true",
  };
}

function nativeSdkText(argumentsList, cwd, environment) {
  const result = childProcess.spawnSync("dotnet", argumentsList, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_048_576,
  });
  if (result.status !== 0) {
    throw new Error(`Native SDK selection failed: ${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result.stdout;
}

function assertGuardContainsProcess(expectedGuard) {
  if (typeof expectedGuard !== "string" || !isAbsolute(expectedGuard) ||
      !/\/tsonic-[A-Za-z0-9_-]+\.scope$/u.test(expectedGuard)) {
    throw new Error("Native compiler servers require an owned bounded test scope.");
  }
  const actual = guardCgroupPath(readFileSync("/proc/self/cgroup", "utf8"));
  if (actual !== expectedGuard && !actual.startsWith(`${expectedGuard}/`)) {
    throw new Error("A native compiler server cannot cross its owning test scope.");
  }
  const memory = readFileSync(join(expectedGuard, "memory.max"), "utf8").trim();
  const swap = readFileSync(join(expectedGuard, "memory.swap.max"), "utf8").trim();
  if (!/^[1-9][0-9]*$/u.test(memory) || swap !== "0") {
    throw new Error("Native compiler servers require finite group memory and zero swap.");
  }
}

after(closeDotnetCompilerServers);
process.once("exit", () => {
  try {
    closeDotnetCompilerServers();
  } catch (error) {
    process.stderr.write(`Owned C# compiler server cleanup failed: ${String(error)}\n`);
    process.exitCode = 1;
  }
});
