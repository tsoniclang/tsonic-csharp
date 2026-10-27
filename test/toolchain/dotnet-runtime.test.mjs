import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { closeDotnetCompilerServers, dotnetDependencyArtifactsDirectory, executeDotnetProject } from "../helpers/dotnet-execution.mjs";
import { nativeConstructionProject, nativeRuntimeLayout, nativeRuntimeReferences, prepareNativeRuntime } from "../helpers/dotnet-runtime.mjs";
import { createTestWorkspace } from "../../../tsonic/test/scripts/test-workspaces.mjs";

const nativeSpawnSync = childProcess.spawnSync;

function withNativeRuntime(context, verify, customize = () => {}) {
  const scratch = fileURLToPath(new URL("../../.temp/native-runtime-controls/", import.meta.url));
  const root = createTestWorkspace(scratch, "checkout-");
  const layout = nativeRuntimeLayout(root);
  const sdk = join(root, "sdk");
  const compiler = join(sdk, "10.0.400", "Roslyn", "bincore", "VBCSCompiler.dll");
  const paths = Object.fromEntries(["Tsonic.CSharp.Runtime", "Tsonic.CSharp.Js", "Tsonic.CSharp.Node", "BouncyCastle.Cryptography"]
    .map(name => [name, join(layout.output, "native-output", `${name}.dll`)]));
  const assets = join(layout.output, "restore", "project.assets.json");
  for (const path of [compiler, layout.runtimeProject, layout.jsProject, layout.nodeProject, layout.proofProject,
    ...Object.values(paths)]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "native-output unit stub; never executed");
  }
  mkdirSync(dirname(assets), { recursive: true });
  const graph = { libraries: {}, project: {
    restore: { projectPath: layout.proofProject }, frameworks: { "net10.0": {} },
  } };
  const jsRuntimeItems = [];
  customize({ graph, paths, layout, jsRuntimeItems });
  writeFileSync(assets, JSON.stringify(graph));
  const calls = [];
  const mockedSpawn = context.mock.method(childProcess, "spawnSync", (command, args, options) => {
    assert.equal(command, "dotnet", "the SDK remains the actual native build entry point");
    calls.push({ args: [...args], options });
    if (args[0] === "--version") return { status: 0, stdout: "10.0.400\n", stderr: "" };
    if (args[0] === "--list-sdks") return { status: 0, stdout: `10.0.400 [${sdk}]\n`, stderr: "" };
    if (args[0] === "build") {
      const js = args[1] === layout.jsProject;
      return { status: 0, stderr: "", stdout: JSON.stringify({
        Properties: { TargetPath: paths[js ? "Tsonic.CSharp.Js" : "Tsonic.CSharp.Node"], TargetFramework: "net10.0", RuntimeIdentifier: "", ProjectAssetsFile: "native-node-assets" },
        Items: {
          ReferenceCopyLocalPaths: (js ? [paths["Tsonic.CSharp.Runtime"]]
            : Object.values(paths).filter(path => path !== paths["Tsonic.CSharp.Node"]))
            .map(path => ({ Identity: path, FullPath: path })),
          FrameworkReference: [{ Identity: "Microsoft.NETCore.App", IsImplicitlyDefined: "true" },
            ...(js ? [] : [{ Identity: "Microsoft.AspNetCore.App" }])],
          RuntimeCopyLocalItems: js ? jsRuntimeItems : [],
        },
      }) };
    }
    if (args[0] === "msbuild") return { status: 0, stderr: "", stdout: JSON.stringify({
      Properties: { ProjectAssetsFile: assets, TargetFramework: "net10.0", RuntimeIdentifier: "" },
    }) };
    assert.equal(args.includes("-shutdown"), true, "only the owned compiler shutdown remains");
    return { status: 0, stdout: "", stderr: "" };
  });
  try {
    verify({ layout, paths, calls, assets });
  } finally {
    try {
      closeDotnetCompilerServers();
    } finally {
      mockedSpawn.mock.restore();
    }
  }
}

test("the prerun builds each real runtime once and restores the real executable proof graph", context => {
  withNativeRuntime(context, ({ layout, calls }) => {
    prepareNativeRuntime(layout);
    const builds = calls.filter(call => call.args[0] === "build");
    const restores = calls.filter(call => call.args[0] === "msbuild");
    assert.equal(builds.length, 2, "the real JS closure builds Runtime and JS, then Node builds against those outputs");
    assert.equal(builds[0].args[1], layout.jsProject, "the real native JS project builds its Runtime reference");
    assert.equal(builds[1].args[1], layout.nodeProject, "the real native Node project supplies its own dependency graph");
    assert.equal(builds[1].args.includes("-p:BuildProjectReferences=false"), true,
      "the Node build consumes prebuilt references instead of compiling Runtime and JS twice");
    assert.equal(builds[0].args.includes("-target:Build"), true, "assembly-path evaluation never replaces compilation");
    assert.equal(restores.length, 1, "the generated proof package graph is restored once");
    assert.equal(restores[0].args[1], layout.proofProject, "restore and execution use the same native project identity");
    assert.equal(restores[0].args.includes("-target:Restore"), true, "NuGet owns graph evaluation and up-to-date checks");
    assert.equal(nativeConstructionProject(layout), layout.proofProject, "generated programs retain that exact native project");
  });
});

test("common generated proofs read built Runtime and JS assemblies without another build or restore", context => {
  withNativeRuntime(context, ({ layout, calls, paths }) => {
    prepareNativeRuntime(layout);
    const before = calls.length;
    const first = nativeRuntimeReferences([], layout);
    const second = nativeRuntimeReferences([], layout);
    assert.equal(calls.length, before, "reading shared native inputs cannot invoke the SDK");
    assert.equal(first.sharedRestore, true, "the common proof retains the pinned graph");
    assert.equal(first.references, second.references, "parallel readers receive identical native references");
    assert.equal(first.references.includes(paths["Tsonic.CSharp.Runtime"]), true, "the exact native Runtime target is referenced");
    assert.equal(first.references.includes(paths["Tsonic.CSharp.Js"]), true, "the exact native JS target is referenced");
    assert.equal(first.references.includes("ProjectReference"), false, "common proofs cannot rebuild runtime projects");
    assert.equal(first.graphReferences.includes(layout.nodeProject), false,
      "unused Node package and framework requirements cannot alter common proof semantics");
  });
});

test("Node references retain native transitive assemblies and explicit framework requirements", context => {
  withNativeRuntime(context, ({ layout, paths }) => {
    prepareNativeRuntime(layout);
    const selected = nativeRuntimeReferences([layout.nodeProject], layout);
    assert.equal(selected.projects.length, 0, "the actual runtime Node project becomes its built assembly");
    assert.equal(selected.references.includes(paths["Tsonic.CSharp.Node"]), true, "the native Node target is retained");
    assert.equal(selected.graphReferences.includes(layout.nodeProject), true,
      "the actual native Node project remains the NuGet authority for transitive package, framework and RID assets");
    assert.equal(selected.graphReferences.includes('BuildReference="false"'), true,
      "restore graph edges cannot rebuild the prebuilt runtime projects");
    assert.equal(selected.references.includes(paths["BouncyCastle.Cryptography"]), false,
      "the helper cannot replace NuGet compile/runtime asset selection with a guessed DLL copy");
    assert.equal(selected.sharedRestore, false, "a different framework graph never borrows common proof assets");
  });
});

test("additional native fixture projects keep their own restore graph and DN05 ownership", context => {
  withNativeRuntime(context, ({ layout }) => {
    prepareNativeRuntime(layout);
    const fixture = join(layout.workspaceRoot, "Fixture.csproj");
    const selected = nativeRuntimeReferences([fixture], layout);
    assert.deepEqual(selected.projects, [fixture], "the actual extra project identity is preserved");
    assert.equal(selected.sharedRestore, false, "a graph with extra native projects is restored natively");
  });
});

test("runtime package requirements select their real native graph instead of borrowing framework-only assets", context => {
  withNativeRuntime(context, ({ layout }) => {
    prepareNativeRuntime(layout);
    const selected = nativeRuntimeReferences([], layout);
    assert.equal(selected.sharedRestore, false, "actual native package assets exclude the framework-only shared graph");
    assert.equal(selected.graphReferences.includes(layout.jsProject), true,
      "NuGet still evaluates the actual runtime project and all its package requirements");
    assert.equal(selected.graphReferences.includes('BuildReference="false"'), true,
      "graph preservation cannot add a runtime compilation path");
  }, ({ paths, jsRuntimeItems }) => {
    jsRuntimeItems.push({ Identity: paths["BouncyCastle.Cryptography"] });
  });
});

test("every prerun delegates changed native source and restore inputs to MSBuild instead of a custom stamp", context => {
  withNativeRuntime(context, ({ layout, calls }) => {
    prepareNativeRuntime(layout);
    writeFileSync(layout.nodeProject, "changed native project input; unit stub only");
    prepareNativeRuntime(layout);
    assert.equal(calls.filter(call => call.args[0] === "build").length, 4,
      "MSBuild decides whether native sources require rebuilding");
    assert.equal(calls.filter(call => call.args[0] === "msbuild").length, 2,
      "NuGet decides whether the package graph requires restoration");
  });
});

test("an unrelated or package-extended graph cannot masquerade as the pinned generated proof restore", context => {
  withNativeRuntime(context, ({ layout }) => {
    assert.throws(() => prepareNativeRuntime(layout), /own pinned framework-only project graph/u,
      "different package assets must be restored for their actual native graph");
    assert.equal(existsSync(layout.manifest), false, "no ready output is published after a rejected graph");
  }, ({ graph }) => { graph.libraries.ForeignPackage = { type: "package" }; });
});

test("foreign checkout provenance and missing native assemblies fail closed without rebuilding in a reader", context => {
  withNativeRuntime(context, ({ layout, paths, calls }) => {
    prepareNativeRuntime(layout);
    const manifest = JSON.parse(readFileSync(layout.manifest, "utf8"));
    manifest.workspaceRoot = join(layout.workspaceRoot, "foreign");
    writeFileSync(layout.manifest, JSON.stringify(manifest));
    const count = calls.length;
    assert.throws(() => nativeRuntimeReferences([], layout), /do not belong to this checkout/u,
      "another checkout cannot supply the native assembly provenance");
    manifest.workspaceRoot = layout.workspaceRoot;
    writeFileSync(layout.manifest, JSON.stringify(manifest));
    rmSync(paths["Tsonic.CSharp.Js"]);
    assert.throws(() => nativeRuntimeReferences([], layout), /do not belong to this checkout/u,
      "missing native build output has no runtime-project fallback");
    assert.equal(calls.length, count, "a reader never starts a competing build or restore");
  });
});

test("native runtime preparation requires explicit absolute checkout ownership", () => {
  assert.throws(() => nativeRuntimeLayout("relative-checkout"), /absolute checkout root/u,
    "native build output cannot be ambiguously shared across roots");
});

test("real generated proof builds use private outputs and do not rewrite the shared native restore", () => {
  assert.equal(childProcess.spawnSync === nativeSpawnSync, true,
    "the real generated proof cannot execute through a unit-test native spy");
  const layout = nativeRuntimeLayout();
  const prepared = JSON.parse(readFileSync(layout.manifest, "utf8"));
  const before = readFileSync(prepared.proofAssets);
  const scratch = fileURLToPath(new URL("../../.temp/native-runtime-controls/", import.meta.url));
  const runtime = nativeRuntimeReferences();
  assert.equal(runtime.sharedRestore, true, "the actual default runtime owns a framework-only shared graph");
  const roots = [];
  for (const name of ["FirstProof", "SecondProof"]) {
    const root = createTestWorkspace(scratch, `${name}-`);
    roots.push(root);
    writeFileSync(join(root, "Program.cs"), 'Tsonic.CSharp.Js.console.log("native-runtime-ready");');
    writeFileSync(join(root, "NativeReferences.props"), `<Project><ItemGroup>${runtime.references}</ItemGroup></Project>`);
    const result = executeDotnetProject(nativeConstructionProject(), ["-c", "Release", "--no-restore",
      `-p:TsonicProofSourceRoot=${root}${sep}`, `-p:AssemblyName=${name}`, "--verbosity", "quiet"],
    { encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304 });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    assert.equal(result.stdout.trim(), "native-runtime-ready", "the actual prebuilt JS and Runtime execute correctly");
    assert.equal(existsSync(join(root, "bin", "Release", prepared.framework, `${name}.dll`)), true,
      "the actual native proof executable stays under its private output directory");
  }
  assert.equal(roots[0] !== roots[1], true, "sequential proofs never share their generated program outputs");
  assert.equal(readFileSync(prepared.proofAssets).equals(before), true,
    "both --no-restore builds leave the shared native package graph byte-identical");
});

test("real prebuilt Node execution retains NuGet transitive crypto dependencies without rebuilding runtimes", () => {
  assert.equal(childProcess.spawnSync === nativeSpawnSync, true,
    "the real crypto proof cannot execute through a unit-test native spy");
  const scratch = fileURLToPath(new URL("../../.temp/native-runtime-controls/", import.meta.url));
  const root = createTestWorkspace(scratch, "node-proof-");
  const layout = nativeRuntimeLayout();
  const runtime = nativeRuntimeReferences([layout.nodeProject]);
  writeFileSync(join(root, "Program.cs"), 'System.Console.WriteLine(Tsonic.CSharp.Node.crypto.createHash("sha3-256").digest("hex"));');
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework>
<Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup><ItemGroup>${runtime.references}${runtime.graphReferences}</ItemGroup></Project>`);
  const before = JSON.parse(readFileSync(layout.manifest, "utf8"));
  const binaries = Object.entries(before.assemblies).map(([name, path]) => [name, path, readFileSync(path)]);
  const result = executeDotnetProject(join(root, "Proof.csproj"), ["-c", "Release", "--verbosity", "quiet",
    `-p:TsonicRuntimeArtifactsPath=${dotnetDependencyArtifactsDirectory()}${sep}`],
  { encoding: "utf8", timeout: 240_000, maxBuffer: 4_194_304 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  assert.equal(result.stdout.trim(), "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
    "the Node implementation actually loads and executes its native BouncyCastle dependency");
  for (const [name, path, bytes] of binaries) {
    assert.equal(readFileSync(path).equals(bytes), true, `${name} remains the exact prebuilt assembly`);
  }
});
