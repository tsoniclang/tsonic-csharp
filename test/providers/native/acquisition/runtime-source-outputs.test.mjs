import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createTestWorkspace } from "../../../../../tsonic/test/scripts/test-workspaces.mjs";
import { acquireCsharpRuntimeSources } from "../../../../dist/providers/native/acquisition/runtime-sources.js";
import { resolveDotnetProviderToolchain } from "../../../../dist/providers/native/acquisition/toolchain.js";
import { instantiateCsharpRuntimeSources } from "../../../../dist/providers/runtime/projects.js";
import { printCsharpRuntimeProject } from "../../../../dist/print/project/runtime.js";

function fixture(invalid = false) {
  const root = createTestWorkspace(fileURLToPath(new URL("../../../../.temp/", import.meta.url)), "metadata-output-family-");
  const sourcesRoot = join(root, "sources");
  mkdirSync(sourcesRoot);
  const propertiesPath = join(sourcesRoot, "Directory.Build.props");
  writeFileSync(propertiesPath, `<Project><PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <BaseOutputPath>$(TsonicRuntimeArtifactsPath)bin/$(MSBuildProjectName)/</BaseOutputPath>
    <BaseIntermediateOutputPath>$(TsonicRuntimeArtifactsPath)obj/$(MSBuildProjectName)/$(TargetFramework)/</BaseIntermediateOutputPath>
  </PropertyGroup></Project>`);
  const dependency = join(sourcesRoot, "SharedDependency.csproj");
  const consumer = join(sourcesRoot, "SharedConsumer.csproj");
  const project = (file, references = "") => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup>
    <ItemGroup><Compile Include="$(MSBuildThisFileDirectory)${file}" />${references}</ItemGroup></Project>`;
  writeFileSync(dependency, project("Dependency.cs"));
  writeFileSync(consumer, project("Consumer.cs", '<ProjectReference Include="$(TsonicDependencyProject)" />'));
  writeFileSync(join(sourcesRoot, "Dependency.cs"), "public sealed class DependencyValue { public int Read() => 7; }");
  writeFileSync(join(sourcesRoot, "Consumer.cs"), invalid
    ? "public sealed class ConsumerValue { public MissingValue Read() => new(); }"
    : "public sealed class ConsumerValue { public DependencyValue Read() => new(); }");
  const sources = [
    { projectPath: consumer, propertiesPath, dependencies: { TsonicDependencyProject: dependency } },
    { projectPath: dependency, propertiesPath, dependencies: {} },
  ];
  const cacheRoot = join(root, "cache");
  const projects = instantiateCsharpRuntimeSources(sources, "net10.0", cacheRoot)
    .map(project => ({ ...project, text: printCsharpRuntimeProject(project) }));
  const preparation = { sources, projects, cacheRoot, project: { kind: "generated" }, properties: [] };
  return { root, sourcesRoot, preparation, toolchain: resolveDotnetProviderToolchain(root, "net10.0") };
}

test("runtime metadata dependencies resolve the same isolated project-specific outputs on cold and warm acquisition", { timeout: 300_000 }, () => {
  const current = fixture();
  const acquired = acquireCsharpRuntimeSources(current.preparation, current.toolchain);
  assert.equal(acquired.kind, "resolved", "the native dependent project resolves its real dependency assembly");
  const selected = acquired.references.filter(path => ["SharedDependency.dll", "SharedConsumer.dll"].includes(basename(path)));
  assert.equal(new Set(selected.map(path => basename(path))).size, 2, "both actual native project outputs are present");
  const metadataRoot = join(current.preparation.cacheRoot, "csharp", "runtime-metadata", "artifacts") + sep;
  assert.equal(selected.every(path => path.startsWith(metadataRoot) && existsSync(path)), true,
    "references are existing private metadata outputs, never guessed copies or source-tree defaults");
  assert.equal(existsSync(join(current.sourcesRoot, "obj")) || existsSync(join(current.sourcesRoot, "bin")), false,
    "acquisition never writes the source project output directories");
  const repeated = acquireCsharpRuntimeSources(current.preparation, current.toolchain);
  assert.equal(repeated.kind, "resolved", "the actual output proof is reusable");
  assert.equal(repeated.references.length === acquired.references.length &&
    repeated.references.every((path, index) => path === acquired.references[index]), true,
  "warm acquisition retains the identical native reference inventory");
});

test("a dependency-coherent metadata build still refuses invalid native source", { timeout: 300_000 }, () => {
  const current = fixture(true);
  const acquired = acquireCsharpRuntimeSources(current.preparation, current.toolchain);
  assert.equal(acquired.kind, "rejected", "an actual native compile error cannot reuse another project's output");
  assert.equal(acquired.diagnostic.extensionCode, "DOTNET_RUNTIME_METADATA_BUILD_FAILED", "the native owner keeps its exact refusal");
  assert.equal(acquired.diagnostic.evidence.some(entry => typeof entry.details?.status === "number" && entry.details.status !== 0 &&
    String(entry.details?.stdout).includes("MissingValue")), true, "the actual native failure evidence remains available");
});
