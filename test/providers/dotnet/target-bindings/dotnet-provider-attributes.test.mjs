import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../../../../dist/public/provider-dotnet.js";
import { buildDotnetFixture } from "../../../helpers/dotnet-fixtures.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const attributeModuleSpecifier = "@tsonic/dotnet/ProviderAttributeFixtures.js";

test(".NET reflection provider records target attributes on types, members, parameters, and returns", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = getCompleteDotnetModule(provider, attributeModuleSpecifier, {});
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
  const module = getCompleteDotnetModule(provider, attributeModuleSpecifier, {});
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

test(".NET reflection provider preserves pointer type attribute values exactly", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = getCompleteDotnetModule(provider, attributeModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const unsupportedTarget = getDeclaration(module, "ProviderAttributeFixtures.UnsupportedAttributeTarget");
  const pointerAttribute = unsupportedTarget.attributes.find((attribute) =>
    idEndsWith(attribute.constructorId, "ProviderAttributeFixtures.TypeOnlyAttribute..ctor(System.Type)")
  );
  assert.ok(pointerAttribute);
  assert.equal(pointerAttribute.target, "type");
  assert.deepEqual(pointerAttribute.arguments?.[0], {
    kind: "constructor",
    value: {
      kind: "type",
      type: {
        kind: "pointer",
        pointee: { kind: "source-primitive", name: "int32" },
        mutability: "mut",
      },
    },
  });
  assert.equal(unsupportedTarget.unsupportedAttributes, undefined);

  const binding = provider.findTargetBindingByTargetId(unsupportedTarget.targetId);
  assert.ok(binding);
  assert.ok(binding.attributes.some((attribute) => attribute.id === pointerAttribute.id));
});

test(".NET reflection provider proves attribute type bases, constructors, defaults, and allowed targets", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildAttributeFixture()] });
  const module = getCompleteDotnetModule(provider, attributeModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const sampleAttribute = getDeclaration(module, "ProviderAttributeFixtures.SampleAttribute");
  assert.deepEqual(sampleAttribute.baseType.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    exportName: "Attribute",
  });

  const constructor = sampleAttribute.members
    ?.filter((member) => member.kind === "constructor")
    .flatMap((member) => member.signatures ?? [])
    .find((signature) => idEndsWith(
      signature.id,
      "ProviderAttributeFixtures.SampleAttribute..ctor(System.String,System.Int32,ProviderAttributeFixtures.ProviderAttributeMode,System.Type,System.Int32[])",
    ));
  assert.ok(constructor);
  assert.deepEqual(constructor.parameters.map((parameter) => parameter.name), [
    "name",
    "count",
    "mode",
    "targetType",
    "numbers",
  ]);

  const attributeUsage = attributeByMetadataName(sampleAttribute.attributes, "System.AttributeUsageAttribute");
  assert.equal(attributeUsage.target, "type");
  assert.ok(idEndsWith(attributeUsage.constructorId, "System.AttributeUsageAttribute..ctor(System.AttributeTargets)"));
  assert.equal(attributeUsage.arguments[0].value.kind, "enum");
  assert.equal(targetMetadataName(attributeUsage.arguments[0].value.type), "System.AttributeTargets");
  assert.equal(attributeUsage.arguments[0].value.fieldName, "All");
  assert.deepEqual(attributeUsage.arguments.slice(1), [
    { kind: "named", name: "AllowMultiple", memberKind: "property", value: { kind: "source-primitive", name: "bool", value: true } },
  ]);

  const targetBinding = provider.findTargetBindingByTargetId(sampleAttribute.targetId);
  assert.ok(targetBinding);
  assert.equal(idEndsWith(targetBinding.csharpBaseType.id, "System.Attribute"), true);
  assert.ok(targetBinding.attributes.some((attribute) =>
    attribute.target === "type" &&
    idEndsWith(attribute.constructorId, "System.AttributeUsageAttribute..ctor(System.AttributeTargets)")
  ));
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

function attributeByMetadataName(attributes, metadataName) {
  const attribute = attributes?.find((candidate) => targetMetadataName(candidate.attributeType) === metadataName);
  assert.ok(attribute, `Missing attribute '${metadataName}'`);
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
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "AttributeProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/attributes"),
  });
}
