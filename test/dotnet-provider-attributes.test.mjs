import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../dist/index.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const attributeModuleSpecifier = "@tsonic/dotnet/ProviderAttributeFixtures.js";

test(".NET reflection provider records target attributes on types, members, parameters, and returns", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = provider.getModule(attributeModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const target = getDeclaration(module, "ProviderAttributeFixtures.AttributeTarget");
  const typeAttribute = sampleAttribute(target.attributes, "type");
  assert.equal(typeAttribute.target, "type");
  assert.equal(targetMetadataName(typeAttribute.attributeType), "ProviderAttributeFixtures.SampleAttribute");
  assert.equal(
    stripAssemblyQualifiers(typeAttribute.constructorId),
    "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])",
  );
  assertAttributePayload(typeAttribute, {
    name: "type",
    count: "3",
    mode: "Fast",
    typeMetadataName: "ProviderAttributeFixtures.AttributeTarget",
    numbers: ["1", "2"],
    named: [
      ["Enabled", "property", { kind: "source-primitive", name: "bool", value: true }],
      ["Label", "field", { kind: "string", value: "type-field" }],
    ],
  });

  const members = new Map(target.members.map((member) => [member.targetName, member]));
  assert.equal(sampleAttribute(members.get(".ctor").signatures[0].attributes, "constructor").target, "constructor");
  assert.equal(sampleAttribute(members.get(".ctor").signatures[0].parameters[0].attributes, "parameter").target, "parameter");
  assert.equal(sampleAttribute(members.get("Field").attributes, "field").target, "field");
  assert.equal(sampleAttribute(members.get("Count").attributes, "property").target, "property");
  assert.equal(sampleAttribute(members.get("Run").signatures[0].attributes, "method").target, "method");
  assert.equal(sampleAttribute(members.get("Run").signatures[0].returnAttributes, "return").target, "return");
  assert.equal(sampleAttribute(members.get("Run").signatures[0].parameters[0].attributes, "method-parameter").target, "parameter");
});

test(".NET target binding facts preserve reflected attributes without exposing attributes as source members", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = provider.getModule(attributeModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const target = getDeclaration(module, "ProviderAttributeFixtures.AttributeTarget");
  const binding = provider.findTargetBindingByTargetId(target.targetId);
  assert.ok(binding);
  const typeAttribute = sampleAttribute(binding.attributes, "type");
  assert.equal(typeAttribute.target, "type");
  assert.equal(typeAttribute.attributeType.kind, "target-named");
  assert.equal(idEndsWith(typeAttribute.attributeType.id, "ProviderAttributeFixtures.SampleAttribute"), true);

  const method = binding.members.find((member) => member.targetName === "Run");
  assert.ok(method);
  assert.equal(sampleAttribute(method.attributes, "method").target, "method");
  assert.equal(sampleAttribute(method.returnAttributes, "return").target, "return");
  assert.equal(sampleAttribute(method.parameters[0].attributes, "method-parameter").target, "parameter");

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const providerType = declarationModel.exports.find((declaration) => declaration.name === "AttributeTarget");
  assert.ok(providerType);
  assert.equal("attributes" in providerType, false);
  assert.equal(providerType.members.some((member) => member.name === "sampleAttribute" || member.name === "typeOnlyAttribute"), false);
});

test(".NET reflection provider records unsupported attribute values instead of dropping them", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = provider.getModule(attributeModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const unsupportedTarget = getDeclaration(module, "ProviderAttributeFixtures.UnsupportedAttributeTarget");
  const unsupported = unsupportedTarget.unsupportedAttributes.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.TypeOnlyAttribute..ctor(System.Type)")
  );
  assert.ok(unsupported);
  assert.equal(unsupported.target, "type");
  assert.match(unsupported.reason, /Type attribute value 'System\.Int32\*' cannot be represented/);
  assert.equal(
    unsupportedTarget.attributes?.some((attribute) => idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.TypeOnlyAttribute..ctor(System.Type)")) ?? false,
    false,
  );

  const binding = provider.findTargetBindingByTargetId(unsupportedTarget.targetId);
  assert.ok(binding);
  assert.ok(binding.unsupportedAttributes.some((attribute) => attribute.id === unsupported.id));
});

function getDeclaration(module, metadataName) {
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find((candidate) => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, `Missing .NET declaration '${metadataName}' in ${module.moduleSpecifier}`);
  return declaration;
}

function sampleAttribute(attributes, name) {
  const attribute = attributes?.find((candidate) =>
    targetMetadataName(candidate.attributeType) === "ProviderAttributeFixtures.SampleAttribute" &&
    candidate.arguments?.[0]?.kind === "constructor" &&
    candidate.arguments[0].value.kind === "string" &&
    candidate.arguments[0].value.value === name
  );
  assert.ok(attribute, `Missing SampleAttribute '${name}'`);
  return attribute;
}

function assertAttributePayload(attribute, expected) {
  const args = attribute.arguments;
  assert.equal(args[0].value.kind, "string");
  assert.equal(args[0].value.value, expected.name);
  assert.deepEqual(args[1].value, { kind: "source-primitive", name: "int32", value: expected.count });
  assert.equal(args[2].value.kind, "enum");
  assert.equal(args[2].value.fieldName, expected.mode);
  assert.equal(args[3].value.kind, "type");
  assert.equal(targetMetadataName(args[3].value.type), expected.typeMetadataName);
  assert.equal(args[4].value.kind, "array");
  assert.deepEqual(args[4].value.elements.map((value) => value.value), expected.numbers);
  assert.deepEqual(
    args.slice(5).map((argument) => [
      argument.name,
      argument.memberKind,
      argument.value,
    ]),
    expected.named,
  );
}

function targetMetadataName(type) {
  if (type.kind === "named") {
    return type.metadataName;
  }
  if (type.kind === "target-named") {
    return stripAssemblyQualifiers(type.id);
  }
  return type.kind;
}

function idEndsWith(id, metadataSuffix) {
  return typeof id === "string" && stripAssemblyQualifiers(id) === metadataSuffix;
}

function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}

function buildAttributeFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/attributes/AttributeProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/obj/");
  const result = spawnSync("dotnet", [
    "build",
    project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    outputDirectory,
    `-p:IntermediateOutputPath=${intermediateDirectory}`,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return join(outputDirectory, "AttributeProviderFixture.dll");
}
