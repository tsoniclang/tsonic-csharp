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
import { renderedRuntimeProjects, repository, framework, fixture, resolver, proof, native } from "./native-metadata.fixtures.mjs";

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
