import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildDotnetProject, closeDotnetCompilerServers, dotnetDependencyArtifactsDirectory, executeDotnetProject } from "../helpers/dotnet-execution.mjs";
import { createTestWorkspace } from "../../../tsonic/test/scripts/test-workspaces.mjs";

function withNativeCalls(context, nativeCall, verify) {
  const scratch = fileURLToPath(new URL("../../.temp/dotnet-execution/", import.meta.url));
  const root = createTestWorkspace(scratch, "proof-");
  const sdk = join(root, "sdk");
  const compiler = join(sdk, "10.0.400", "Roslyn", "bincore", "VBCSCompiler.dll");
  mkdirSync(join(sdk, "10.0.400", "Roslyn", "bincore"), { recursive: true });
  writeFileSync(compiler, "native-call stub; never executed");
  writeFileSync(join(root, "Proof.dll"), "native build-output stub; never executed");
  const calls = [];
  context.mock.method(childProcess, "spawnSync", (command, args, options) => {
    assert.equal(command, "dotnet", "one canonical native executable");
    calls.push({ args: [...args], options });
    if (args[0] === "--version") return { status: 0, stdout: "10.0.400\n", stderr: "" };
    if (args[0] === "--list-sdks") return { status: 0, stdout: `10.0.400 [${sdk}]\n`, stderr: "" };
    return nativeCall(args, options);
  });
  try {
    verify({ root, compiler, calls });
  } finally {
    closeDotnetCompilerServers();
  }
}

function successfulNativeCall(args) {
  const stdout = args[0] === "build" && args.includes("-getProperty:TargetPath,TargetFramework")
    ? JSON.stringify({ Properties: { TargetPath: join(dirname(args[1]), "Proof.dll"), TargetFramework: "net10.0" } })
    : args[0].endsWith("Proof.dll") ? "native output\n" : "";
  return { status: 0, stdout, stderr: "", signal: null };
}

test("native execution builds a fresh project before running its exact native target", context => {
  withNativeCalls(context, successfulNativeCall, ({ root, calls }) => {
    const project = join(root, "Proof.csproj");
    const result = executeDotnetProject(project, ["-c", "Release", "--verbosity", "quiet"],
      { cwd: root, encoding: "utf8", timeout: 240_000 });
    const builds = calls.filter(call => call.args[0] === "build");
    const runs = calls.filter(call => call.args[0] === join(root, "Proof.dll"));
    assert.equal(builds.length, 1, "one actual build is required");
    assert.equal(runs.length, 1, "one native run follows the build");
    assert.equal(calls.indexOf(builds[0]) < calls.indexOf(runs[0]), true, "build precedes native run");
    assert.equal(builds[0].args[1], project, "build uses the original project");
    assert.equal(builds[0].args.includes("-target:Build"), true,
      "native output-property evaluation cannot replace the actual Build target");
    assert.deepEqual(runs[0].args, [join(root, "Proof.dll")], "run uses only the native build's exact target");
    assert.equal(calls.some(call => call.args[0] === "run" || call.args[0] === "restore"), false,
      "executing the native target performs no second project evaluation, build or restore");
    assert.equal(result.stdout, "native output\n", "build output does not contaminate program stdout");
    assert.equal(runs[0].options.timeout, 240_000, "native timeout is preserved");
  });
});

test("a failed native build never runs an unbuilt project", context => {
  const failed = { status: 1, stdout: "CS0452 native refusal", stderr: "", signal: null };
  withNativeCalls(context, args => args[0] === "build" ? failed : successfulNativeCall(args), ({ root, calls }) => {
    const result = executeDotnetProject(join(root, "Proof.csproj"), [], { cwd: root });
    assert.equal(result === failed, true, "the exact native build failure is preserved");
    assert.equal(calls.some(call => call.args[0] === join(root, "Proof.dll")), false, "there is no run after rejection");
  });
});

test("native execution uses the build's target path rather than guessing an assembly name", context => {
  let target;
  withNativeCalls(context, args => {
    if (args[0] === "build") {
      target = join(dirname(args[1]), "CustomName.dll");
      writeFileSync(target, "native output stub; never executed");
      return { status: 0, stdout: JSON.stringify({ Properties: { TargetPath: target, TargetFramework: "net10.0" } }), stderr: "" };
    }
    return successfulNativeCall(args);
  }, ({ root, calls }) => {
    executeDotnetProject(join(root, "Proof.csproj"), ["-c", "Release"], { cwd: root });
    assert.equal(calls.some(call => call.args.length === 1 && call.args[0] === target), true,
      "the actual native target wins over the project filename");
    assert.equal(calls.some(call => call.args[0] === join(root, "Proof.dll")), false,
      "there is no guessed output fallback");
  });
});

test("a successful command without exact native target evidence cannot execute stale output", context => {
  withNativeCalls(context, args => args[0] === "build"
    ? { status: 0, stdout: JSON.stringify({ Properties: { TargetFramework: "net10.0" } }), stderr: "" }
    : successfulNativeCall(args), ({ root, calls }) => {
    assert.throws(() => executeDotnetProject(join(root, "Proof.csproj"), [], { cwd: root }),
      /did not publish its exact executable target/u, "successful build status is not guessed output provenance");
    assert.equal(calls.some(call => call.args[0] === join(root, "Proof.dll")), false,
      "an existing file cannot replace native output evidence");
  });
});

test("a timed out native build preserves its signal and never runs", context => {
  const timeout = { status: null, signal: "SIGTERM", error: Object.assign(new Error("native timeout"), { code: "ETIMEDOUT" }) };
  withNativeCalls(context, args => args[0] === "build" ? timeout : successfulNativeCall(args), ({ root, calls }) => {
    const result = executeDotnetProject(join(root, "Proof.csproj"), [], { cwd: root });
    assert.equal(result === timeout, true, "native timeout result retains identity");
    assert.equal(result.signal, "SIGTERM", "the original timeout signal is not hidden");
    assert.equal(calls.some(call => call.args[0] === join(root, "Proof.dll")), false, "a timed out build has no run");
  });
});

test("fixture builds share one private compiler identity without a global MSBuild server", context => {
  withNativeCalls(context, successfulNativeCall, ({ root, calls }) => {
    buildDotnetProject(join(root, "First.csproj"), [], { cwd: root });
    buildDotnetProject(join(root, "Second.csproj"), [], { cwd: root });
    const builds = calls.filter(call => call.args[0] === "build");
    const identifiers = builds.map(call => call.args.find(argument => argument.startsWith("-p:SharedCompilationId=")));
    assert.equal(identifiers.length, 2, "both native builds have a compiler owner");
    assert.equal(typeof identifiers[0], "string", "compiler identity is explicit");
    assert.equal(identifiers[0], identifiers[1], "sequential builds reuse their own compiler");
    assert.equal(builds.every(call => call.args.includes("-p:UseSharedCompilation=true")), true, "native compiler reuse is enabled");
    assert.equal(builds.every(call => call.args.includes("-nr:false")), true, "MSBuild nodes cannot outlive the invocation");
    assert.equal(builds.every(call => call.options.env.DOTNET_CLI_USE_MSBUILD_SERVER === "0"), true,
      "unowned global MSBuild servers stay disabled");
    assert.equal(builds.every(call => call.options.env.MSBUILDDISABLENODEREUSE === "1"), true,
      "native node reuse stays disabled");
  });
});

test("compiler shutdown targets only the selected SDK and owned pipe", context => {
  withNativeCalls(context, successfulNativeCall, ({ root, calls, compiler }) => {
    buildDotnetProject(join(root, "Proof.csproj"), [], { cwd: root });
    const build = calls.find(call => call.args[0] === "build");
    const identifier = build.args.find(argument => argument.startsWith("-p:SharedCompilationId="))
      .slice("-p:SharedCompilationId=".length);
    closeDotnetCompilerServers();
    const stopped = calls.filter(call => call.args.includes("-shutdown"));
    assert.equal(stopped.length, 1, "one owned compiler is shut down");
    assert.deepEqual(stopped[0].args, [compiler, "-shutdown", `-pipename:${identifier}`],
      "shutdown names only the original native SDK and pipe");
    assert.equal(calls.some(call => call.args.includes("build-server")), false, "there is no global shutdown");
    closeDotnetCompilerServers();
    assert.equal(calls.filter(call => call.args.includes("-shutdown")).length, 1, "shutdown is idempotent");
  });
});

test("native compiler servers cannot start outside their actual owned guard", context => {
  withNativeCalls(context, successfulNativeCall, ({ root, calls }) => {
    const previous = process.env.TSONIC_TEST_GUARD_CGROUP;
    process.env.TSONIC_TEST_GUARD_CGROUP = "/sys/fs/cgroup/tsonic-unrelated-tests.scope";
    try {
      assert.throws(() => buildDotnetProject(join(root, "Proof.csproj"), [], { cwd: root }),
        /cannot cross its owning test scope/u, "a foreign scope cannot own the compiler");
      assert.equal(calls.length, 0, "no native command runs before guard ownership is established");
    } finally {
      if (previous === undefined) delete process.env.TSONIC_TEST_GUARD_CGROUP;
      else process.env.TSONIC_TEST_GUARD_CGROUP = previous;
    }
  });
});

test("sequential native proofs share only their process-owned dependency outputs", context => {
  let dependencies;
  withNativeCalls(context, successfulNativeCall, ({ root, calls }) => {
    dependencies = dotnetDependencyArtifactsDirectory();
    const project = join(root, "Proof.csproj");
    const argumentsList = ["-c", "Release", `-p:TsonicRuntimeArtifactsPath=${dependencies}/`];
    executeDotnetProject(project, argumentsList, { cwd: root });
    assert.equal(dotnetDependencyArtifactsDirectory(), dependencies, "the process reuses the same native dependency owner");
    executeDotnetProject(project, argumentsList, { cwd: root });
    const builds = calls.filter(call => call.args[0] === "build");
    assert.equal(builds.length, 2, "every proof still performs its actual native Build target");
    assert.equal(builds.every(call => call.args.includes(`-p:TsonicRuntimeArtifactsPath=${dependencies}/`)), true,
      "MSBuild receives the same dependency output root");
    assert.equal(dependencies.startsWith(`${root}/`), false, "shared dependencies are outside private proof output");
    assert.equal(calls.filter(call => call.args[0] === join(root, "Proof.dll")).length, 2,
      "both executions retain their native proof target");
  });
  assert.equal(existsSync(dependencies), false, "normal cleanup follows the final native call and owned compiler shutdown");
});

for (const failure of [
  { name: "nonzero build", result: { status: 1, stdout: "native rejection", stderr: "" } },
  { name: "timeout", result: { status: null, signal: "SIGTERM", error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) } },
  { name: "signal", result: { status: null, signal: "SIGKILL" } },
  { name: "spawn exception", error: new Error("native spawn failed") },
]) {
  test(`native ${failure.name} retires dependency outputs without deleting or reusing them`, context => {
    withNativeCalls(context, args => {
      if (args[0] !== "build") return successfulNativeCall(args);
      if (failure.error !== undefined) throw failure.error;
      return failure.result;
    }, ({ root }) => {
      const retired = dotnetDependencyArtifactsDirectory();
      const invoke = () => executeDotnetProject(join(root, "Proof.csproj"), [], { cwd: root });
      if (failure.error !== undefined) {
        assert.throws(invoke, error => error === failure.error, "the original native exception is preserved");
      } else {
        assert.equal(invoke() === failure.result, true, "the original native result is preserved");
      }
      const replacement = dotnetDependencyArtifactsDirectory();
      assert.equal(replacement !== retired, true, "the next invocation has a fresh owner");
      assert.equal(existsSync(retired), true, "potentially live descendant outputs are not deleted");
      assert.equal(existsSync(replacement), true, "the replacement directory is independently owned");
    });
  });
}

test("native dependency cleanup cannot interrupt an active build", context => {
  let dependencies;
  withNativeCalls(context, args => {
    if (args[0] === "build") {
      assert.throws(closeDotnetCompilerServers, /native call is in flight/u,
        "the owner cannot remove active native output");
      assert.equal(existsSync(dependencies), true, "active dependency outputs remain present");
    }
    return successfulNativeCall(args);
  }, ({ root }) => {
    dependencies = dotnetDependencyArtifactsDirectory();
    executeDotnetProject(join(root, "Proof.csproj"), [], { cwd: root });
  });
  assert.equal(existsSync(dependencies), false, "only the completed sequence is cleaned");
});
