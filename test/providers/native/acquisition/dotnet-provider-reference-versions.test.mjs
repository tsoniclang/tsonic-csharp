import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/dotnet-provider-fixtures/reference-versions");
const built = new Map();

function assembly(name, variant, version, source, reference) {
  const key = `${name}-${variant}`;
  if (built.has(key)) return built.get(key);
  const directory = join(root, key);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "Source.cs"), source);
  const project = join(directory, `${name}.csproj`);
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>${name}</AssemblyName>
    <AssemblyVersion>${version}</AssemblyVersion>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Source.cs" />
    ${reference === undefined ? "" : `<Reference Include="VersionedDependency" HintPath="${reference}" />`}
  </ItemGroup>
</Project>`);
  const result = buildDotnetFixture({
    project, projectDirectory: directory, outputDirectory: join(directory, "bin"),
    intermediateDirectory: join(directory, "obj"), outputAssemblyName: `${name}.dll`,
  });
  built.set(key, result);
  return result;
}

function dependency(version, culture = "") {
  return assembly("VersionedDependency", `${version}-${culture}`, version,
    `[assembly: System.Reflection.AssemblyCulture("${culture}")]
namespace Versioned.Dependency;
public abstract class Base { public abstract string Name { get; } }
`);
}

function consumer() {
  return assembly("VersionedConsumer", "base", "1.0.0.0", `
namespace Versioned.Consumer;
public sealed class Derived : Versioned.Dependency.Base {
    public override string Name => "resolved";
}
`, dependency("1.0.0.0"));
}

for (const version of ["1.0.0.0", "2.0.0.0"]) {
  test(`.NET provider resolves the selected equal-or-higher dependency ${version} and preserves its identity`, () => {
    const selected = dependency(version);
    const provider = createDotnetReflectionTypeDataProvider({
      references: [consumer(), selected], disablePersistentCache: true,
    });
    const result = getCompleteDotnetModule(provider, "@tsonic/dotnet/Versioned.Consumer.js", { requestedExports: ["Derived"] });
    assert.equal("exports" in result, true, JSON.stringify(result));
    assert.equal(result.exports[0].sourceName, "Derived");
    const base = getCompleteDotnetModule(provider, "@tsonic/dotnet/Versioned.Dependency.js", { requestedExports: ["Base"] });
    assert.equal("exports" in base, true, JSON.stringify(base));
    assert.equal(base.exports[0].assembly.version, version);
    assert.equal(base.exports[0].assembly.path, selected);
    assert.ok(base.exports[0].targetId.includes(`Version=${version},`));
  });
}

for (const [name, version, culture] of [
  ["version downgrade", "0.0.0.0", ""],
  ["culture mismatch", "2.0.0.0", "fr"],
]) {
  test(`.NET provider rejects a ${name} rather than hiding it with assembly-name matching`, () => {
    const provider = createDotnetReflectionTypeDataProvider({
      references: [consumer(), dependency(version, culture)], disablePersistentCache: true,
    });
    const result = getCompleteDotnetModule(provider, "@tsonic/dotnet/Versioned.Consumer.js", { requestedExports: ["Derived"] });
    assert.equal(result.code, "DOTNET_REFLECTION_PROVIDER_FAILED", JSON.stringify(result));
    assert.match(JSON.stringify(result.evidence), /VersionedDependency/u);
  });
}
