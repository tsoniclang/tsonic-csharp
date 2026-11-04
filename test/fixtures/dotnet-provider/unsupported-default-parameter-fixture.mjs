import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { buildDotnetFixture } from "../../helpers/dotnet-fixtures.mjs";

const fixtureParent = fileURLToPath(new URL("../../../.temp/dotnet-provider-fixtures/", import.meta.url));
let unsupportedDefaultParameterReference;

export function buildUnsupportedDefaultParameterFixture() {
  if (unsupportedDefaultParameterReference !== undefined) return unsupportedDefaultParameterReference;
  const fixtureDirectory = createTestWorkspace(fixtureParent, "unsupported-default-params-");
  const project = join(fixtureDirectory, "UnsupportedDefaultParameterProviderFixture.csproj");
  const source = join(fixtureDirectory, "UnsupportedDefaultParameterSource.cs");
  const outputDirectory = join(fixtureDirectory, "bin");
  const intermediateDirectory = join(fixtureDirectory, "obj/");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`);
  writeFileSync(source, `using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace ProviderUnsupportedDefaultFixtures;

public sealed class UnsupportedDefaultParameterSource
{
    public void UnsupportedDateTimeDefault(
        [Optional, DateTimeConstant(638000000000000000L)] DateTime value)
    {
    }
}
`);
  unsupportedDefaultParameterReference = buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedDefaultParameterProviderFixture.dll",
    projectDirectory: fixtureDirectory,
  });
  return unsupportedDefaultParameterReference;
}
