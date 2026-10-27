import childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import { guardCgroupPath } from "../../../tsonic/test/scripts/guard-cgroup.mjs";

const compilerServers = new Map();
let dependencyArtifacts;
let activeNativeCalls = 0;

export function dotnetDependencyArtifactsDirectory() {
  const guard = process.env.TSONIC_TEST_GUARD_CGROUP;
  assertGuardContainsProcess(guard);
  if (dependencyArtifacts !== undefined) {
    if (dependencyArtifacts.guard !== guard) {
      throw new Error("Native dependency outputs cannot cross their owning test scope.");
    }
    return dependencyArtifacts.path;
  }
  const parent = fileURLToPath(new URL("../../.temp/native-dependency-artifacts/", import.meta.url));
  mkdirSync(parent, { recursive: true });
  const path = mkdtempSync(join(realpathSync(parent), "process-"));
  chmodSync(path, 0o700);
  const identity = lstatSync(path, { bigint: true });
  dependencyArtifacts = Object.freeze({ path, guard, dev: identity.dev, ino: identity.ino });
  return path;
}

export function buildDotnetProject(project, argumentsList = [], options = {}) {
  const context = compilerServer(options);
  const childJobs = process.env.TSONIC_TEST_CHILD_JOBS;
  if (!/^[1-9][0-9]*$/u.test(childJobs ?? "")) {
    throw new Error("Native test builds require an explicit positive child-job budget.");
  }
  return invokeDotnet(["build", project, ...argumentsList,
    `--maxcpucount:${childJobs}`, "-nr:false", "-p:UseSharedCompilation=true",
    `-p:SharedCompilationId=${context.pipeName}`], {
    ...options,
    env: nativeEnvironment(options.env),
  });
}

export function executeDotnetProject(project, argumentsList = [], options = {}) {
  const built = buildDotnetProject(project, [...argumentsList, "-target:Build", "-getProperty:TargetPath,TargetFramework"], {
    ...options,
    encoding: "utf8",
  });
  if (built.status !== 0) return built;
  let output;
  try {
    output = JSON.parse(built.stdout);
  } catch (error) {
    retireDependencyArtifacts();
    throw error;
  }
  const target = output?.Properties?.TargetPath;
  const framework = output?.Properties?.TargetFramework;
  if (typeof target !== "string" || !isAbsolute(target) || !target.endsWith(".dll") ||
      !existsSync(target) || typeof framework !== "string" || framework.length === 0) {
    retireDependencyArtifacts();
    throw new Error("The successful native build did not publish its exact executable target.");
  }
  return invokeDotnet([target], options);
}

export function closeDotnetCompilerServers() {
  if (activeNativeCalls !== 0) {
    throw new Error("Native dependency cleanup cannot run while a native call is in flight.");
  }
  const failures = [];
  for (const [identity, context] of compilerServers) {
    compilerServers.delete(identity);
    try {
      assertGuardContainsProcess(context.guard);
      const stopped = invokeDotnet([context.compiler,
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
    retireDependencyArtifacts();
    throw new AggregateError(failures, "Owned C# compiler servers did not all shut down.");
  }
  if (dependencyArtifacts !== undefined) {
    assertGuardContainsProcess(dependencyArtifacts.guard);
    const identity = lstatSync(dependencyArtifacts.path, { bigint: true });
    if (!identity.isDirectory() || identity.dev !== dependencyArtifacts.dev ||
        identity.ino !== dependencyArtifacts.ino || realpathSync(dependencyArtifacts.path) !== dependencyArtifacts.path) {
      retireDependencyArtifacts();
      throw new Error("Native dependency output identity changed; refusing cleanup.");
    }
    rmSync(dependencyArtifacts.path, { recursive: true });
    dependencyArtifacts = undefined;
  }
}

function invokeDotnet(argumentsList, options) {
  activeNativeCalls += 1;
  try {
    const result = childProcess.spawnSync("dotnet", argumentsList, options);
    if (result.status !== 0 || result.signal != null || result.error !== undefined) {
      retireDependencyArtifacts();
    }
    return result;
  } catch (error) {
    retireDependencyArtifacts();
    throw error;
  } finally {
    activeNativeCalls -= 1;
  }
}

function retireDependencyArtifacts() {
  if (dependencyArtifacts === undefined) return;
  process.stderr.write(`Retained native dependency outputs after failure: ${JSON.stringify(dependencyArtifacts.path)}\n`);
  dependencyArtifacts = undefined;
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
  const result = invokeDotnet(argumentsList, {
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
