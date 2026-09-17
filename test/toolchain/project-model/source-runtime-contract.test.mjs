import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { csharpCoreRuntimeSource, csharpJsRuntimeSource, csharpRuntimeSourceContributions } from "../../../dist/public/provider.js";
import { readCsharpTargetFramework } from "../../../dist/options/csharp-target-options.js";
import { parseCsharpTargetFramework } from "../../../dist/target-model/configuration/framework.js";
import { selectDotnetPlatformDirectory } from "../../../dist/providers/dotnet/reflection/tool/toolchain.js";
import { validateDotnetReflectionTargetFramework } from "../../../dist/providers/dotnet/reflection/cache-request.js";
import { resolveDotnetProviderToolPaths } from "../../../dist/providers/dotnet/reflection/tool/path-resolution.js";

import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { analyzeCsharpProject } from "../../../dist/analysis/project/index.js";
import { planCsharpProjectFile } from "../../../dist/backend/planner/project/project-artifacts.js";
import { materializeCsharpOutputPlan } from "../../../dist/backend/emission/materialize.js";

function csharpRuntimeProjectReference(selected, source) {
  const contributions = csharpRuntimeSourceContributions(source);
  const configuration = createCsharpTargetConfiguration(selected.target, process.cwd(), resolve(".temp/source-runtime-contract/out"));
  const classified = analyzeCsharpProject(configuration, contributions.references);
  assert.equal(classified.kind, "resolved", JSON.stringify(classified));
  const project = planCsharpProjectFile({ program: { configuration, project: classified.value }, host: { paths: selected.paths } });
  materializeCsharpOutputPlan({ sources: [], project: { kind: "generated", project } });
  return project.references.find(reference => reference.include.endsWith("/" + source.projectPath.split("/").at(-1)));
}

function context(framework) {
  return { target: { id: "csharp", options: { targetFramework: framework } }, paths: { cacheRoot: resolve(".temp/source-runtime-contract/cache") } };
}

test("an injected provider toolchain cannot contradict the selected compilation", () => {
  const toolchain = Object.freeze({
    projectDirectory: process.cwd(), sdkRoot: "/sdk", sdkVersion: "10.0.400",
    toolTargetFramework: "net10.0", targetFramework: "net10.0", platformDirectory: "/sdk/shared/10.0.11",
  });
  const options = {
    toolchain, toolProjectPath: resolve("tools/dotnet-type-provider/DotnetTypeProvider.csproj"),
    toolBuildRoot: resolve(".temp/source-runtime-contract/provider"),
  };
  assert.throws(() => resolveDotnetProviderToolPaths({ ...options, targetFramework: "net11.0" }), /compilation framework/u);
  assert.throws(() => resolveDotnetProviderToolPaths({ ...options, projectDirectory: resolve("other") }), /compilation project directory/u);
  assert.equal(resolveDotnetProviderToolPaths({ ...options, targetFramework: "net10.0", projectDirectory: process.cwd() }).toolchain, toolchain);
});

test("runtime source projects give restore and build one immutable framework-specific project graph", () => {
  const projects = new Set();
  for (const framework of ["net10.0", "net11.0", "net12.0", "net42.0"]) {
    const selected = context(framework);
    const reference = csharpRuntimeProjectReference(selected, csharpJsRuntimeSource);
    const core = csharpRuntimeProjectReference(selected, csharpCoreRuntimeSource);
    assert.equal(reference.kind, "project");
    assert.equal(reference.attributes, undefined);
    assert.equal(Object.isFrozen(reference), true);
    const output = readFileSync(reference.include, "utf8");
    assert.ok(output.includes(`<TargetFramework>${framework}</TargetFramework>`));
    assert.ok(output.includes(core.include));
    assert.ok(output.includes(csharpJsRuntimeSource.projectPath));
    assert.ok(output.includes(csharpJsRuntimeSource.propertiesPath));
    assert.doesNotMatch(output, /HintPath|AdditionalProperties|<Compile/u);
    const before = statSync(reference.include, { bigint: true }).mtimeNs;
    assert.deepEqual(csharpRuntimeProjectReference(selected, csharpJsRuntimeSource), reference);
    assert.equal(statSync(reference.include, { bigint: true }).mtimeNs, before);
    projects.add(reference.include);
  }
  assert.equal(projects.size, 4);
});

test("framework default is explicit and validation admits future versions, not malformed or old selections", () => {
  assert.equal(readCsharpTargetFramework({ id: "csharp" }), "net10.0");
  for (const framework of ["net10.0", "net11.0", "net12.0", "net11.0-windows10.0.26100.0"]) {
    assert.equal(readCsharpTargetFramework(context(framework).target), framework);
    assert.equal(validateDotnetReflectionTargetFramework({ targetFramework: framework }, { targetFramework: framework }), undefined);
  }
  for (const framework of ["net8.0", "net9.0", "netstandard2.1", "net10", "net10.0;Injected=true", "net10.0\n", "net010.0", "net9007199254740993.0"]) {
    assert.throws(() => parseCsharpTargetFramework(framework), /framework/u);
  }
  assert.equal(validateDotnetReflectionTargetFramework({ targetFramework: "net11.0" }, { targetFramework: "net10.0" }).code,
    "DOTNET_REFLECTION_TARGET_FRAMEWORK_MISMATCH");
});

test("source-project analysis rejects missing, cyclic, forged and conflicting native dependencies", () => {
  const configuration = createCsharpTargetConfiguration(context("net11.0").target, process.cwd(), resolve(".temp/source-runtime-contract/out"));
  const references = csharpRuntimeSourceContributions(csharpJsRuntimeSource).references;
  for (const mutate of [
    (values) => values.splice(0, 1),
    (values) => { values[0].attributes.DirectoryBuildPropsPath = "relative.props"; },
    (values) => { values[1].attributes.AdditionalProperties = "TargetFramework=net10.0"; },
    (values) => { values[0].attributes.TsonicSelfProject = values[0].include; },
    (values) => values.push({ ...values[0], attributes: { DirectoryBuildPropsPath: resolve("Other.props") } }),
  ]) {
    const modified = structuredClone(references);
    mutate(modified);
    const result = analyzeCsharpProject(configuration, modified);
    assert.equal(result.kind, "rejected", JSON.stringify(modified));
    assert.ok(result.diagnostics.every(diagnostic => diagnostic.code === "CSHARP_RUNTIME_REFERENCE_INVALID"));
  }
  const duplicate = analyzeCsharpProject(configuration, [...references, ...references]);
  assert.equal(duplicate.kind, "resolved");
  assert.equal(duplicate.value.runtimeSources.length, 2);
});

test("platform selection never substitutes the tooling runtime for the requested framework", () => {
  const output = [
    "Microsoft.NETCore.App 10.0.9 [/sdk/shared/Microsoft.NETCore.App]",
    "Microsoft.NETCore.App 10.0.11 [/sdk/shared/Microsoft.NETCore.App]",
    "Microsoft.NETCore.App 11.0.0-rc.1.26425.128 [/sdk/shared/Microsoft.NETCore.App]",
    "Microsoft.AspNetCore.App 11.0.0-rc.1.26425.128 [/sdk/shared/Microsoft.AspNetCore.App]",
  ].join("\n");
  assert.equal(selectDotnetPlatformDirectory(output, "net10.0"), "/sdk/shared/Microsoft.NETCore.App/10.0.11");
  assert.equal(selectDotnetPlatformDirectory(output, "net11.0"), "/sdk/shared/Microsoft.NETCore.App/11.0.0-rc.1.26425.128");
  assert.throws(() => selectDotnetPlatformDirectory(output, "net12.0"), /No .NET 12.0 runtime/u);
  assert.throws(() => selectDotnetPlatformDirectory(`${output}\nMicrosoft.NETCore.App invalid [/sdk]`, "net10.0"), /invalid runtime/u);
  assert.throws(() => selectDotnetPlatformDirectory(`${output}\nMicrosoft.NETCore.App 10.0.11 [/other]`, "net10.0"), /ambiguous/u);
});

test("runtime project instances reject malformed paths, dependency injection and cycles", () => {
  const selected = context("net11.0");
  const valid = { projectPath: resolve("native.csproj"), propertiesPath: resolve("Directory.Build.props") };
  assert.throws(() => csharpRuntimeProjectReference(selected, { ...valid, projectPath: "relative.csproj" }), /absolute/u);
  assert.throws(() => csharpRuntimeProjectReference(selected, { ...valid, propertiesPath: resolve("native.dll") }), /props/u);
  assert.throws(() => csharpRuntimeProjectReference(selected, { ...valid, dependencies: { TargetFramework: valid } }), /property/u);
  const cycle = { ...valid, dependencies: {} };
  cycle.dependencies.TsonicSelfProject = cycle;
  assert.throws(() => csharpRuntimeProjectReference(selected, cycle), /cycle/u);
  const reference = csharpRuntimeProjectReference(selected, { ...valid, projectPath: resolve("directory;$(Other)/native.csproj") });
  assert.match(readFileSync(reference.include, "utf8"), /directory%3B%24%28Other%29/u);
});
