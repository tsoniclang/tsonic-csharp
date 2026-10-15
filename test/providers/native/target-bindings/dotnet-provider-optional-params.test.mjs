import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  dotnetModuleToProviderDeclarationModel,
} from "../../../../dist/public/provider-dotnet.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../../../helpers/dotnet-reflection-provider.mjs";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test(".NET provider preserves optional and params-array facts from reflected member signatures", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {});
  assert.equal("exports" in module, true);

  const rawOptional = rawSignature(
    module,
    "ArgumentException",
    "ThrowIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(rawOptional.parameters[0].optional, undefined);
  assert.equal(rawOptional.parameters[1].name, "paramName");
  assert.equal(rawOptional.parameters[1].optional, true);

  const rawParams = rawSignature(
    module,
    "Console",
    "WriteLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(rawParams.parameters[0].rest, undefined);
  assert.equal(rawParams.parameters[1].name, "arg");
  assert.deepEqual(rawParams.parameters[1].type, {
    kind: "nullable-reference",
    elementType: {
      kind: "array",
      elementType: {
        kind: "nullable-reference",
        elementType: { kind: "object" },
      },
    },
  });
  assert.deepEqual(rawParams.parameters[1].sourceType, {
    kind: "array",
    elementType: { kind: "unknown" },
  });
  assert.equal(rawParams.parameters[1].rest, true);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceOptional = sourceSignature(
    sourceModel,
    "ArgumentException",
    "ThrowIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(sourceOptional.parameters[1].optional, true);

  const sourceParams = sourceSignature(
    sourceModel,
    "Console",
    "WriteLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(sourceParams.parameters[1].rest, true);
  assert.deepEqual(sourceParams.parameters[1].type, {
    kind: "array",
    elementType: { kind: "unknown" },
  });

  const targetOptional = targetMember(
    provider,
    "@tsonic/dotnet/System.js",
    "System.ArgumentException",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(targetOptional.parameters[1].optional, true);
  assert.equal(targetOptional.parameters[1].csharpOmittableOptionalArgument, true);

  const targetParams = targetMember(
    provider,
    "@tsonic/dotnet/System.js",
    "System.Console",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(targetParams.parameters[1].paramsArray, true);
});

test(".NET provider preserves default parameter values only from reflected default metadata", () => {
  const reference = buildDefaultParameterFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderDefaultFixtures.js", {});
  assert.equal("exports" in module, true);

  const defaultsSignatureId = "ProviderDefaultFixtures.DefaultParameterSource.WithDefaults(System.String,System.Int32,System.Boolean,System.Char,System.Decimal,ProviderDefaultFixtures.DefaultMode,System.String)";
  const expectedDefaults = [
    { kind: "string", value: "proved" },
    { kind: "source-primitive", name: "int32", value: "7" },
    { kind: "source-primitive", name: "bool", value: true },
    { kind: "source-primitive", name: "char", value: "x" },
    { kind: "source-primitive", name: "decimal", value: "12.5" },
    { kind: "enum", value: "2", fieldName: "Enabled" },
    { kind: "null" },
  ];

  const rawDefaults = rawSignature(module, "DefaultParameterSource", "WithDefaults", defaultsSignatureId);
  assert.deepEqual(rawDefaults.parameters.map((parameter) => parameter.defaultValue), expectedDefaults);
  assert.equal(rawDefaults.parameters.every((parameter) => parameter.optional === true), true);

  const rawOptionalWithoutDefault = rawSignature(
    module,
    "DefaultParameterSource",
    "OptionalWithoutDefault",
    "ProviderDefaultFixtures.DefaultParameterSource.OptionalWithoutDefault(System.String)",
  );
  assert.equal(rawOptionalWithoutDefault.parameters[0].optional, true);
  assert.equal(rawOptionalWithoutDefault.parameters[0].defaultValue, undefined);

  const rawRequired = rawSignature(
    module,
    "DefaultParameterSource",
    "Required",
    "ProviderDefaultFixtures.DefaultParameterSource.Required(System.String)",
  );
  assert.equal(rawRequired.parameters[0].optional, undefined);
  assert.equal(rawRequired.parameters[0].defaultValue, undefined);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceDefaults = sourceSignature(sourceModel, "DefaultParameterSource", "WithDefaults", defaultsSignatureId);
  assert.deepEqual(sourceDefaults.parameters.map((parameter) => parameter.optional), [true, true, true, true, true, true, true]);
  assert.equal(sourceDefaults.parameters.some((parameter) => "defaultValue" in parameter), false);

  const targetDefaults = targetMember(
    provider,
    "@tsonic/dotnet/ProviderDefaultFixtures.js",
    "ProviderDefaultFixtures.DefaultParameterSource",
    defaultsSignatureId,
  );
  assert.deepEqual(targetDefaults.parameters.map((parameter) => parameter.defaultValue), expectedDefaults);

  const targetOptionalWithoutDefault = targetMember(
    provider,
    "@tsonic/dotnet/ProviderDefaultFixtures.js",
    "ProviderDefaultFixtures.DefaultParameterSource",
    "ProviderDefaultFixtures.DefaultParameterSource.OptionalWithoutDefault(System.String)",
  );
  assert.equal(targetOptionalWithoutDefault.parameters[0].optional, true);
  assert.equal(targetOptionalWithoutDefault.parameters[0].defaultValue, undefined);
});

test(".NET provider records unsupported default parameter values without exposing source defaults", () => {
  const reference = buildUnsupportedDefaultParameterFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference] });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderUnsupportedDefaultFixtures.js", {});
  assert.equal("exports" in module, true);

  const signatureId = "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource.UnsupportedDateTimeDefault(System.DateTime)";
  const rawSignatureWithUnsupportedDefault = rawSignature(
    module,
    "UnsupportedDefaultParameterSource",
    "UnsupportedDateTimeDefault",
    signatureId,
  );
  const rawParameter = rawSignatureWithUnsupportedDefault.parameters[0];
  assert.equal(rawParameter.optional, true);
  assert.equal(rawParameter.defaultValue, undefined);
  assert.equal(rawParameter.unsupportedDefaultValue.kind, "unsupported-default-value");
  assert.equal(rawParameter.unsupportedDefaultValue.parameterName, "value");
  assert.equal(stripAssemblyQualifiers(rawParameter.unsupportedDefaultValue.id), `${signatureId}:parameter:value:default`);
  assert.match(rawParameter.unsupportedDefaultValue.reason, /System\.DateTime/u);
  assert.match(JSON.stringify(rawParameter.unsupportedDefaultValue.evidence), /parameter 'value'/u);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceSignatureWithUnsupportedDefault = sourceSignature(
    sourceModel,
    "UnsupportedDefaultParameterSource",
    "UnsupportedDateTimeDefault",
    signatureId,
  );
  assert.equal(sourceSignatureWithUnsupportedDefault.parameters[0].optional, true);
  assert.equal("defaultValue" in sourceSignatureWithUnsupportedDefault.parameters[0], false);
  assert.equal("unsupportedDefaultValue" in sourceSignatureWithUnsupportedDefault.parameters[0], false);

  const targetSignatureWithUnsupportedDefault = targetMember(
    provider,
    "@tsonic/dotnet/ProviderUnsupportedDefaultFixtures.js",
    "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource",
    signatureId,
  );
  assert.deepEqual(targetSignatureWithUnsupportedDefault.parameters[0].unsupportedDefaultValue, rawParameter.unsupportedDefaultValue);
  assert.equal(targetSignatureWithUnsupportedDefault.parameters[0].csharpOmittableOptionalArgument, true);
});

function rawSignature(module, typeName, memberName, signatureId) {
  const type = module.exports.find((declaration) => declaration.kind === "type" && declaration.sourceName === typeName);
  assert.ok(type, `raw type ${typeName}`);
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.sourceName === memberName &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureId))
  );
  assert.ok(member, `raw member ${typeName}.${memberName}`);
  const signature = member.signatures.find((candidate) => idHasShape(candidate.id, signatureId));
  assert.ok(signature, `raw signature ${signatureId}`);
  return signature;
}

function sourceSignature(model, typeName, memberName, signatureId) {
  const type = model.exports.find((declaration) => declaration.name === typeName);
  assert.ok(type, `source type ${typeName}`);
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.name === memberName &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureId))
  );
  assert.ok(member, `source member ${typeName}.${memberName}`);
  const signature = member.signatures.find((candidate) => idHasShape(candidate.id, signatureId));
  assert.ok(signature, `source signature ${signatureId}`);
  return signature;
}

function targetMember(provider, moduleSpecifier, typeMetadataName, memberIdShape) {
  const binding = getDotnetBinding(provider, moduleSpecifier, typeMetadataName);
  const member = binding.members?.find((candidate) => idHasShape(candidate.id, memberIdShape));
  assert.ok(member, `target member ${memberIdShape}`);
  return member;
}

function getDotnetBinding(provider, moduleSpecifier, metadataName) {
  const module = getCompleteDotnetModule(provider, moduleSpecifier, {});
  assert.equal("exports" in module, true, JSON.stringify(module));
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find((candidate) => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, `Missing .NET declaration '${metadataName}' in ${moduleSpecifier}`);
  const binding = provider.findTargetBindingByTargetId(declaration.targetId);
  assert.ok(binding, `Missing .NET target binding '${declaration.targetId}'`);
  return binding;
}

function idHasShape(id, metadataShape) {
  return stripAssemblyQualifiers(id) === metadataShape;
}

function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}

function buildDefaultParameterFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/default-params/DefaultParameterProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/default-params/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/default-params/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "DefaultParameterProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/default-params"),
  });
}

function buildUnsupportedDefaultParameterFixture() {
  const fixtureDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-default-params");
  const project = join(fixtureDirectory, "UnsupportedDefaultParameterProviderFixture.csproj");
  const source = join(fixtureDirectory, "UnsupportedDefaultParameterSource.cs");
  const outputDirectory = join(fixtureDirectory, "bin");
  const intermediateDirectory = join(fixtureDirectory, "obj/");
  mkdirSync(fixtureDirectory, { recursive: true });
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
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedDefaultParameterProviderFixture.dll",
    projectDirectory: fixtureDirectory,
  });
}
