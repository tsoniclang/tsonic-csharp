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
import { createCsharpCompilationRecords } from "../../../dist/analysis/program/records/compilation.js";
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

test("preparation, ordinary queries and complete SDK inheritance winners have zero runtime build cost", () => {
  const inputs = fixture();
  const provider = resolver(inputs);
  assert.throws(() => provider.prepareRuntimeSources(inputs.preparation), {
    name: "TypeError", message: "C# native runtime acquisition inputs are prepared exactly once per analysis.",
  }, "same-session repeated preparation remains rejected rather than cached");
  const fresh = resolver(inputs);
  assert.throws(() => fresh.prepareRuntimeSources({ ...inputs.preparation, cacheRoot: join(inputs.root, "different-cache") }), {
    name: "TypeError", message: "C# native runtime acquisition inputs are prepared exactly once per analysis.",
  }, "a fresh resolver accepts one preparation only, including when the second input differs");
  assert.equal(existsSync(inputs.wrapper.path), false, "preparation publishes no runtime build input");
  const missing = provider.findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "ordinary");
  assert.equal(missing.kind, "missing", "an ordinary speculative query never compiles a runtime");
  assert.equal(existsSync(inputs.wrapper.path), false, "ordinary lookup performs no runtime preparation");
  const object = native(provider.findTargetBindingByMetadataName("System.Object", "inheritance"));
  assert.equal(object.csharpInheritance.length, 1, "the actual SDK native root is complete");
  assert.equal(existsSync(inputs.wrapper.path), false, "a complete SDK winner never compiles a runtime");
  const valueType = native(provider.findTargetBindingByMetadataName("System.ValueType", "inheritance"));
  assert.equal(valueType.csharpInheritance.length, 2, "the actual native struct-container root reaches Object");
  assert.equal(existsSync(inputs.wrapper.path), false, "a native struct-container root also performs no runtime build");
  assert.equal(provider.validateReferences().length, 0, "all selected native reference snapshots remain valid");
});

test("Error and Exception roots select the actual published metadata names and keep their physical chain identities", () => {
  const root = createTestWorkspace(resolve(repository, ".temp/native-runtime-metadata"), "core-");
  const cacheRoot = join(root, "cache");
  const configuration = createCsharpTargetConfiguration({ id: "csharp", options: { targetFramework: framework } },
    repository, join(root, "out"));
  const classified = classifyCsharpProjectConfiguration(configuration, csharpRuntimeSourceContributions(csharpCoreRuntimeSource).references, cacheRoot);
  assert.equal(classified.kind, "resolved", "the selected actual core runtime is classified");
  const project = classified.value;
  const inputs = { root, cacheRoot, wrapper: project.runtimeProjects[0], preparation: Object.freeze({
    sources: project.runtimeSources, projects: renderedRuntimeProjects(project), project: project.project,
    properties: project.properties, cacheRoot }) };
  const provider = resolver(inputs);
  const routes = [];
  for (const carrier of [csharpExceptionTargetType(), csharpRuntimeErrorTargetType()]) {
    const route = csharpNativeInheritanceLookup(carrier);
    assert.equal(route.kind, "metadata-name", `${carrier.id}: explicit native evidence selects one metadata query`);
    const selected = native(provider.findTargetBindingByMetadataName(route.metadataName, "inheritance"));
    assert.equal(selected.targetName, route.metadataName, `${carrier.id}: the actual provider publishes the exact selected name`);
    assert.equal(selected.id === carrier.id, false, `${carrier.id}: symbolic identity is not a fabricated physical identity`);
    const physical = csharpNativeInheritanceLookup(selected.csharpType);
    assert.equal(physical.kind, "target-id", `${carrier.id}: reflected native evidence preserves assembly identity`);
    assert.equal(physical.targetId, selected.id, `${carrier.id}: exact actual physical root`);
    for (const entry of selected.csharpInheritance)
      assert.equal(native(provider.findTargetBindingByTargetId(entry.targetId, "inheritance")).id, entry.targetId,
        `${carrier.id}: the complete physical native chain is acquired`);
    routes.push({ carrier: carrier.id, selected: route, physical });
  }
  const evidence = proof(inputs);
  for (const output of [...evidence.outputs, ...evidence.references])
    assert.equal(createHash("sha256").update(readFileSync(output.path)).digest("hex"), output.sha256,
      "the selected core runtime output and actual reference retain exact native build content");
  console.log(JSON.stringify({ nativeCoreRootRoutes: routes, inputFingerprint: evidence.inputFingerprint }));
});

test("one retained native runtime demand uses the actual wrapper reference and reuses exact content across sessions", () => {
  const inputs = fixture();
  const provider = resolver(inputs);
  const coldStart = performance.now();
  const selected = native(provider.findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "inheritance"));
  const coldMilliseconds = performance.now() - coldStart;
  assert.equal(selected.csharpInheritance.length, 3, "the complete physical base chain reaches Object");
  assert.equal(selected.csharpInheritance[0].targetId, selected.id, "the selected native assembly owns the class");
  for (const entry of selected.csharpInheritance)
    native(provider.findTargetBindingByTargetId(entry.targetId, "inheritance"));
  const captured = proof(inputs);
  assert.equal(captured.outputs.length > 0 && captured.references.length > 0, true, "native output and actual reference evidence retained");
  for (const output of [...captured.outputs, ...captured.references])
    assert.equal(createHash("sha256").update(readFileSync(output.path)).digest("hex"), output.sha256, "exact referenced content verified");
  const times = captured.outputs.map(output => statSync(output.path, { bigint: true }).mtimeNs);
  const sameStart = performance.now();
  assert.equal(provider.findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "inheritance").binding === selected, true,
    "same-session complete demand is one immutable lookup");
  const sameSessionMilliseconds = performance.now() - sameStart;
  const fresh = resolver(inputs);
  const freshStart = performance.now();
  const repeated = native(fresh.findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "inheritance"));
  const newSessionMilliseconds = performance.now() - freshStart;
  assert.equal(repeated.id, selected.id, "a fresh provider session uses the same actual native identity");
  const after = proof(inputs);
  assert.equal(after.inputFingerprint, captured.inputFingerprint, "the real MSBuild imported-input fingerprint is stable");
  for (const [index, output] of after.outputs.entries()) {
    assert.equal(output.sha256, captured.outputs[index].sha256, "new-session native output bytes are unchanged");
    assert.equal(statSync(output.path, { bigint: true }).mtimeNs, times[index], "warm metadata acquisition does not rebuild the runtime");
  }
  assert.equal(readFileSync(inputs.wrapper.path, "utf8"), inputs.wrapper.text, "the built wrapper is exactly the emitted wrapper");
  assert.equal(provider.findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "ordinary").kind, "missing",
    "acquired inheritance metadata never broadens the ordinary native query domain");
  console.log(JSON.stringify({ nativeRuntimeMetadata: { coldMilliseconds, sameSessionMilliseconds, newSessionMilliseconds,
    outputBytes: captured.outputs.reduce((total, output) => total + statSync(output.path).size, 0), inputFingerprint: captured.inputFingerprint } }));
});

test("changed imported source content and corrupted native output invalidate runtime metadata reuse", () => {
  const inputs = fixture();
  const name = "InheritanceProviderFixtures.EmptyNative";
  const initial = native(resolver(inputs).findTargetBindingByMetadataName(name, "inheritance"));
  assert.equal(initial.csharpInheritableMembers.some(member => member.targetName === "Marker"), false, "the original class has no invented member");
  const first = proof(inputs);
  const source = join(inputs.source, "InheritanceTargets.cs");
  writeFileSync(source, readFileSync(source, "utf8").replace("public class EmptyNative { }", "public class EmptyNative { public int Marker => 7; }"));
  const changed = native(resolver(inputs).findTargetBindingByMetadataName(name, "inheritance"));
  assert.equal(changed.csharpInheritableMembers.some(member => member.targetName === "Marker"), true, "the changed source is actually rebuilt and reflected");
  const second = proof(inputs);
  assert.equal(second.inputFingerprint === first.inputFingerprint, false, "source bytes, not only a project path, own the cache identity");
  const output = second.outputs[0];
  writeFileSync(output.path, "not a native assembly");
  const repaired = native(resolver(inputs).findTargetBindingByMetadataName(name, "inheritance"));
  assert.equal(repaired.csharpInheritableMembers.some(member => member.targetName === "Marker"), true, "corrupt output never reuses an old native fact");
  const third = proof(inputs);
  for (const file of third.outputs)
    assert.equal(createHash("sha256").update(readFileSync(file.path)).digest("hex"), file.sha256, "actual rebuilt output content is verified");
  const properties = readFileSync(inputs.runtime.propertiesPath, "utf8");
  assert.equal(properties.includes("<Version>0.0.6</Version>"), true, "the actual imported native version input is present");
  writeFileSync(inputs.runtime.propertiesPath, properties.replace("<Version>0.0.6</Version>", "<Version>0.0.7</Version>"));
  const imported = native(resolver(inputs).findTargetBindingByMetadataName(name, "inheritance"));
  const fourth = proof(inputs);
  assert.equal(fourth.inputFingerprint === third.inputFingerprint, false, "actual imported MSBuild content invalidates reuse");
  assert.equal(imported.id === repaired.id, false, "the changed native assembly version is actually rebuilt and reflected");
});

test("runtime wrappers follow the one artifact-root and exact-project-identity formula", () => {
  const inputs = fixture();
  const wrapper = inputs.wrapper;
  const escaped = value => value.replace(/[%$@();'?*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
  const expected = ["<Project>", "  <PropertyGroup>", `    <TargetFramework>${framework}</TargetFramework>`,
    `    <DirectoryBuildPropsPath>${escaped(inputs.runtime.propertiesPath)}</DirectoryBuildPropsPath>`,
    "    <TsonicRuntimeArtifactsRoot Condition=\"'$(TsonicRuntimeArtifactsRoot)' == ''\">$(MSBuildThisFileDirectory)artifacts/</TsonicRuntimeArtifactsRoot>",
    `    <TsonicRuntimeArtifactsPath>$(TsonicRuntimeArtifactsRoot)${wrapper.artifactIdentity}/</TsonicRuntimeArtifactsPath>`,
    "  </PropertyGroup>", `  <Import Project="${escaped(inputs.runtime.projectPath)}" />`, "</Project>", ""].join("\n");
  const planned = planCsharpProjectFile({ program: { records: createCsharpCompilationRecords({ project: inputs.project,
    namespace: inputs.project.namespace, languageDialect: inputs.configuration.languageDialect }) } });
  assert.equal(planned.runtimeProjects === inputs.project.runtimeProjects, true, "the backend reads the one pre-seal plan");
  const materialized = materializeCsharpOutputPlan({ project: { kind: "generated", project: planned }, sources: [] });
  assert.equal(readFileSync(wrapper.path, "utf8"), expected, "the complete wrapper bytes follow the single root-plus-exact-identity contract");
  const text = printCsharpProjectFile(planned);
  assert.equal(materialized.artifacts.find(artifact => artifact.kind === "project" && artifact.path === planned.path)?.text,
    text, "actual project materialization preserves the complete project bytes");
  assert.equal(text.includes(`<ProjectReference Include="${wrapper.path}" />`), true, "the emitted project references the exact acquired wrapper");
  assert.equal(existsSync(resolve(repository, "src/backend/planner/project/runtime-projects.ts")), false, "the old late decision owner is removed");
  assert.equal(existsSync(resolve(repository, "src/backend/artifact-model/project/runtime.ts")), false, "the superseded type owner has no alias");
  assert.equal(existsSync(resolve(repository, "src/print/project/csharp-runtime-project.ts")), false, "a pass-through printer is removed rather than exempted from layering");
});

test("runtime native selection sees all actually selected project references before one complete-winner decision in either graph order", () => {
  const root = createTestWorkspace(resolve(repository, ".temp/native-runtime-metadata"), "collisions-");
  const propertiesPath = join(root, "Runtime.props");
  copyFileSync(resolve(repository, "../csharp-runtime/Directory.Build.props"), propertiesPath);
  const sources = ["First", "Second"].map(name => {
    const directory = join(root, name);
    mkdirSync(directory);
    const projectPath = join(directory, `${name}.csproj`);
    writeFileSync(projectPath, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${framework}</TargetFramework>` +
      `<AssemblyName>${name}RuntimeCollision</AssemblyName><EnableDefaultCompileItems>false</EnableDefaultCompileItems>` +
      `</PropertyGroup><ItemGroup><Compile Include="$(MSBuildThisFileDirectory)Widget.cs" /></ItemGroup></Project>`);
    writeFileSync(join(directory, "Widget.cs"), `namespace Shared; public class Widget { public int Value => 1; } public class Marker${name} { }`);
    return { projectPath, propertiesPath };
  });
  const observations = [];
  for (const [orderIndex, ordered] of [sources, [...sources].reverse()].entries()) {
    const cacheRoot = join(root, `cache-${orderIndex}`);
    const configuration = createCsharpTargetConfiguration({ id: "csharp", options: { targetFramework: framework } },
      repository, join(root, `out-${orderIndex}`));
    const classified = classifyCsharpProjectConfiguration(configuration,
      ordered.flatMap(source => csharpRuntimeSourceContributions(source).references), cacheRoot);
    assert.equal(classified.kind, "resolved", `graph ${orderIndex}: actual selected runtime classification`);
    const project = classified.value;
    const provider = resolver({ preparation: Object.freeze({ sources: project.runtimeSources, projects: renderedRuntimeProjects(project),
      project: project.project, properties: project.properties, cacheRoot }) });
    let bindingIds;
    for (const phase of ["cold", "warm"]) {
      const result = provider.findTargetBindingByMetadataName("Shared.Widget", "inheritance");
      assert.equal(result.kind, "rejected", `graph ${orderIndex}/${phase}: no prefix winner escapes acquisition`);
      assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT", `graph ${orderIndex}/${phase}: same original conflict code`);
      assert.equal(result.diagnostic.numericCode, 9200000, `graph ${orderIndex}/${phase}: same original numeric code`);
      assert.equal(result.diagnostic.message, "C# providers supplied contradictory complete target binding evidence.",
        `graph ${orderIndex}/${phase}: same original message`);
      assert.equal(result.diagnostic.evidence[0].details.query, "Shared.Widget", `graph ${orderIndex}/${phase}: exact query`);
      const current = [...result.diagnostic.evidence[0].details.bindingIds].sort();
      assert.equal(current.length, 2, `graph ${orderIndex}/${phase}: every selected complete native winner is visible`);
      assert.equal(current[0] === current[1], false, `graph ${orderIndex}/${phase}: assembly identities stay distinct`);
      if (bindingIds !== undefined) assert.deepEqual(current, bindingIds, `graph ${orderIndex}/${phase}: warm ambiguity is identical`);
      bindingIds = current;
    }
    for (const id of bindingIds)
      assert.equal(native(provider.findTargetBindingByTargetId(id, "inheritance")).id, id, "physical identities remain individually resolvable after ambiguity");
    for (const name of ["First", "Second"])
      assert.equal(native(provider.findTargetBindingByMetadataName(`Shared.Marker${name}`, "inheritance")).targetName,
        `Shared.Marker${name}`, "a contradictory metadata query does not poison its noncolliding sibling");
    observations.push({ bindingIds, projects: project.runtimeProjects.map(project => project.sourceProject) });
  }
  assert.deepEqual(observations[0].bindingIds, observations[1].bindingIds, "both graph input orders reject the same two complete actual identities");
  console.log(JSON.stringify({ nativeRuntimeCollisionOrders: observations }));
});

test("user-owned runtime metadata comes from native ResolveReferences without compiling or mutating the application", () => {
  const inputs = fixture();
  const projectFile = join(inputs.root, "UserOwned.csproj");
  const invalidApplication = join(inputs.root, "UnbuiltApplication.cs");
  writeFileSync(invalidApplication, "This application source is intentionally unavailable before compiler emission.");
  const text = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${framework}</TargetFramework>` +
    "<EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup>" +
    `<Compile Include="${invalidApplication}" /><ProjectReference Include="${inputs.runtime.projectPath}" />` +
    "</ItemGroup></Project>";
  writeFileSync(projectFile, text);
  const userInputs = { ...inputs, preparation: { ...inputs.preparation, project: { kind: "user-owned", projectFile } } };
  const first = native(resolver(userInputs).findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "inheritance"));
  assert.equal(first.csharpInheritance.length, 3, "the actual native referenced project supplies the complete class chain");
  assert.equal(readFileSync(projectFile, "utf8"), text, "the user-owned project configuration is unchanged");
  assert.equal(existsSync(inputs.wrapper.path), false, "user-owned mode never substitutes a generated runtime wrapper");
  const bin = join(inputs.root, "bin");
  const outputEntries = existsSync(bin) ? readdirSync(bin, { recursive: true, withFileTypes: true }) : [];
  assert.equal(outputEntries.some(entry => !entry.isDirectory()), false, "ResolveReferences emits no application build output");
  const key = createHash("sha256").update(projectFile).digest("hex");
  const proofFile = join(inputs.cacheRoot, "csharp/runtime-metadata", key, "proof.json");
  const before = JSON.parse(readFileSync(proofFile, "utf8"));
  assert.equal(before.outputs.length > 0, true, "the actual native ProjectReference output is identified");
  const times = before.outputs.map(output => statSync(output.path, { bigint: true }).mtimeNs);
  const repeated = native(resolver(userInputs).findTargetBindingByMetadataName("InheritanceProviderFixtures.ClosedBase", "inheritance"));
  assert.equal(repeated.id, first.id, "new-session user-owned lookup keeps the actual assembly identity");
  const after = JSON.parse(readFileSync(proofFile, "utf8"));
  assert.equal(after.inputFingerprint, before.inputFingerprint, "the actual user-project imported-input observation is stable");
  for (const [index, output] of after.outputs.entries()) {
    assert.equal(output.sha256, before.outputs[index].sha256, "native resolved reference content is unchanged");
    assert.equal(statSync(output.path, { bigint: true }).mtimeNs, times[index], "native warm reference resolution does not rebuild runtime code");
  }
});
