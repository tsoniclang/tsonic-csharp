import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpCoreRuntimeSource, csharpRuntimeSourceContributions } from "../../../dist/providers/runtime/source-projects.js";
import { classifyCsharpProjectConfiguration } from "../../../dist/compilation/project.js";
import { createCsharpTargetConfiguration } from "../../../dist/compilation/configuration.js";
import { csharpNativeInheritanceLookup, csharpNativeTargetBindingFact } from "../../../dist/target-model/types/native-inheritance.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { materializeCsharpOutputPlan } from "../../../dist/backend/emission/materialize.js";
import { planCsharpProjectFile } from "../../../dist/backend/planner/project/project-artifacts.js";
import { createCsharpCompilationRecords } from "../../../dist/analysis/program/records/program/compilation.js";
import { printCsharpProjectFile } from "../../../dist/print/project/manifest.js";
import { printCsharpRuntimeProject } from "../../../dist/print/project/runtime.js";

// The compilation session hands provider acquisition each runtime project with its printed MSBuild text.
function renderedRuntimeProjects(project) {
  return project.runtimeProjects.map(runtime => ({ ...runtime, text: printCsharpRuntimeProject(runtime) }));
}

const repository = resolve(new URL("../../..", import.meta.url).pathname);

const framework = "net10.0";

function fixture() {
  const root = createTestWorkspace(resolve(repository, ".temp/native-runtime-metadata"), "runtime-");
  const source = join(root, "native");
  mkdirSync(source);
  for (const file of ["InheritanceProviderFixture.csproj", "InheritanceTargets.cs"])
    copyFileSync(resolve(repository, "test/fixtures/dotnet-provider/inheritance", file), join(source, file));
  const propertiesPath = join(root, "Runtime.props");
  copyFileSync(resolve(repository, "../csharp-runtime/Directory.Build.props"), propertiesPath);
  const runtime = { projectPath: join(source, "InheritanceProviderFixture.csproj"),
    propertiesPath };
  const cacheRoot = join(root, "cache");
  const configuration = createCsharpTargetConfiguration({ id: "csharp", options: { targetFramework: framework } },
    repository, join(root, "out"));
  const classified = classifyCsharpProjectConfiguration(configuration, csharpRuntimeSourceContributions(runtime).references, cacheRoot);
  assert.equal(classified.kind, "resolved", "the actual selected runtime graph is classified once");
  const project = classified.value;
  const preparation = Object.freeze({ sources: project.runtimeSources, projects: renderedRuntimeProjects(project),
    project: project.project, properties: project.properties, cacheRoot });
  // The wrapper project as printed for acquisition (runtime project instances carry no text since the port).
  const wrapper = preparation.projects[0];
  return { root, source, runtime, cacheRoot, configuration, project, preparation, wrapper };
}

function resolver(inputs) {
  const provider = createDotnetReflectionTypeDataProvider();
  const result = createCsharpProviderRelationResolver({ providers: [provider], providerPolicies: [] });
  result.prepareRuntimeSources(inputs.preparation);
  return result;
}

function proof(inputs) {
  const key = createHash("sha256").update(inputs.wrapper.path).digest("hex");
  return JSON.parse(readFileSync(join(inputs.cacheRoot, "csharp/runtime-metadata", key, "proof.json"), "utf8"));
}

function native(result) {
  assert.equal(result.kind, "resolved", result.kind === "rejected" ? result.diagnostic.message : "one exact native binding");
  const binding = csharpNativeTargetBindingFact(result.binding);
  assert.equal(binding !== undefined, true, "the selected class has the required complete native view");
  return binding;
}

export { renderedRuntimeProjects, repository, framework, fixture, resolver, proof, native };
