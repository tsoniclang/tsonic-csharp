import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../dist/index.js";
import { findTargetMemberForCall } from "../dist/source/csharp-source-semantics/target-member-selection.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test(".NET provider preserves optional and params-array facts from reflected member signatures", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in module, true);

  const rawOptional = rawSignature(
    module,
    "ArgumentException",
    "throwIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(rawOptional.parameters[0].optional, undefined);
  assert.equal(rawOptional.parameters[1].name, "paramName");
  assert.equal(rawOptional.parameters[1].optional, true);

  const rawParams = rawSignature(
    module,
    "Console",
    "writeLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(rawParams.parameters[0].rest, undefined);
  assert.equal(rawParams.parameters[1].name, "arg");
  assert.equal(rawParams.parameters[1].type.kind, "array");
  assert.equal(rawParams.parameters[1].rest, true);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceOptional = sourceSignature(
    sourceModel,
    "ArgumentException",
    "throwIfNullOrEmpty",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(sourceOptional.parameters[1].optional, true);

  const sourceParams = sourceSignature(
    sourceModel,
    "Console",
    "writeLine",
    "System.Console.WriteLine(System.String,System.Object[])",
  );
  assert.equal(sourceParams.parameters[1].rest, true);

  const targetOptional = targetMember(
    provider,
    "@tsonic/dotnet/System.js",
    "System.ArgumentException",
    "System.ArgumentException.ThrowIfNullOrEmpty(System.String,System.String)",
  );
  assert.equal(targetOptional.parameters[1].optional, true);

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
  const module = provider.getModule("@tsonic/dotnet/ProviderDefaultFixtures.js", {});
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

  const rawDefaults = rawSignature(module, "DefaultParameterSource", "withDefaults", defaultsSignatureId);
  assert.deepEqual(rawDefaults.parameters.map((parameter) => parameter.defaultValue), expectedDefaults);
  assert.equal(rawDefaults.parameters.every((parameter) => parameter.optional === true), true);

  const rawOptionalWithoutDefault = rawSignature(
    module,
    "DefaultParameterSource",
    "optionalWithoutDefault",
    "ProviderDefaultFixtures.DefaultParameterSource.OptionalWithoutDefault(System.String)",
  );
  assert.equal(rawOptionalWithoutDefault.parameters[0].optional, true);
  assert.equal(rawOptionalWithoutDefault.parameters[0].defaultValue, undefined);

  const rawRequired = rawSignature(
    module,
    "DefaultParameterSource",
    "required",
    "ProviderDefaultFixtures.DefaultParameterSource.Required(System.String)",
  );
  assert.equal(rawRequired.parameters[0].optional, undefined);
  assert.equal(rawRequired.parameters[0].defaultValue, undefined);

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceDefaults = sourceSignature(sourceModel, "DefaultParameterSource", "withDefaults", defaultsSignatureId);
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

test(".NET selected target-member identity enforces optional and params-array arity facts", () => {
  const optionalMember = method("Example.Target.Optional(System.String,System.String)", [
    parameter("value", stringType()),
    parameter("name", stringType(), { optional: true }),
  ]);
  assert.equal(selectBySignature(optionalMember, 1)?.id, optionalMember.id);
  assert.equal(selectBySignature(optionalMember, 2)?.id, optionalMember.id);
  assert.equal(selectBySignature(optionalMember, 0), undefined);
  assert.equal(selectBySignature(optionalMember, 3), undefined);

  const paramsMember = method("Example.Target.Params(System.String,System.String[])", [
    parameter("format", stringType()),
    parameter("values", { kind: "array", element: stringType() }, { paramsArray: true }),
  ]);
  assert.equal(selectBySignature(paramsMember, 1)?.id, paramsMember.id);
  assert.equal(selectBySignature(paramsMember, 3)?.id, paramsMember.id);
  assert.equal(selectBySignature(paramsMember, 0), undefined);

  const requiredMember = method("Example.Target.Required(System.String,System.String)", [
    parameter("value", stringType()),
    parameter("name", stringType()),
  ]);
  assert.equal(selectBySignature(requiredMember, 1), undefined);

  const malformedParamsMember = method("Example.Target.Malformed(System.String[],System.String)", [
    parameter("values", { kind: "array", element: stringType() }, { paramsArray: true }),
    parameter("tail", stringType()),
  ]);
  assert.equal(selectBySignature(malformedParamsMember, 2), undefined);
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
  const module = provider.getModule(moduleSpecifier, {});
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

function selectBySignature(member, argumentCount) {
  return findTargetMemberForCall(
    {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Example.Target",
      target: "csharp",
      kind: "class",
      members: [member],
    },
    { signatureId: member.id },
    { arguments: Array.from({ length: argumentCount }, () => ({})) },
    {},
    () => undefined,
  );
}

function method(id, parameters) {
  return {
    id,
    sourceName: "target",
    targetName: "Target",
    kind: "method",
    parameters,
    returnType: { kind: "target-named", id: "System.Void" },
    overloadGroup: "Example.Target.Target",
  };
}

function parameter(name, type, options = {}) {
  return {
    name,
    type,
    passingMode: "by-value",
    ...options,
  };
}

function stringType() {
  return { kind: "target-named", id: "System.String" };
}

function buildDefaultParameterFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/default-params/DefaultParameterProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/default-params/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/default-params/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:BaseIntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "DefaultParameterProviderFixture.dll");
}
