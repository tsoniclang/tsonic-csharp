import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";
import { getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const constraintModuleSpecifier = "@tsonic/dotnet/ProviderConstraintFixtures.js";

test(".NET provider keeps CLR generic constraints in target facts, not source virtual declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildConstraintFixture()] });
  const module = getCompleteDotnetModule(provider, constraintModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const rawReferenceNewTarget = getDeclaration(module, "ProviderConstraintFixtures.ReferenceNewTarget`1");
  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceReferenceNewTarget = getSourceDeclaration(sourceModel, "ReferenceNewTarget");

  assert.equal(sourceReferenceNewTarget.typeParameters?.[0]?.constraints, undefined);

  const sourceCopy = getSourceMember(sourceReferenceNewTarget, "Copy");
  const sourceCopyTypeParameter = sourceCopy.signatures[0].typeParameters[0];
  assert.equal(sourceCopyTypeParameter.constraints, undefined);

  const binding = provider.findTargetBindingByTargetId(rawReferenceNewTarget.targetId);
  assert.ok(binding);
  assert.deepEqual(
    binding.typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["reference-type", "constructible", "ITagged"],
  );
  const targetCopy = binding.members.find((member) => idEndsWith(member.id, "ProviderConstraintFixtures.ReferenceNewTarget`1.Copy``1(TMethod)"));
  assert.ok(targetCopy);
  assert.deepEqual(
    targetCopy.typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["constructible", "EntityBase", "ITagged"],
  );

  const rawStructTarget = getDeclaration(module, "ProviderConstraintFixtures.StructTarget`1");
  const sourceStructTarget = getSourceDeclaration(sourceModel, "StructTarget");
  assert.equal(sourceStructTarget.typeParameters?.[0]?.constraints, undefined);
  assert.deepEqual(
    provider.findTargetBindingByTargetId(rawStructTarget.targetId).typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["value-type", "constructible"],
  );

  const rawUnmanagedTarget = getDeclaration(module, "ProviderConstraintFixtures.UnmanagedTarget`1");
  const sourceUnmanagedTarget = getSourceDeclaration(sourceModel, "UnmanagedTarget");
  assert.equal(sourceUnmanagedTarget.typeParameters?.[0]?.constraints, undefined);
  assert.deepEqual(
    provider.findTargetBindingByTargetId(rawUnmanagedTarget.targetId).typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["unmanaged"],
  );

  const rawNotNullTarget = getDeclaration(module, "ProviderConstraintFixtures.NotNullTarget`1");
  const sourceNotNullTarget = getSourceDeclaration(sourceModel, "NotNullTarget");
  assert.equal(sourceNotNullTarget.typeParameters?.[0]?.constraints, undefined);
  assert.deepEqual(
    provider.findTargetBindingByTargetId(rawNotNullTarget.targetId).typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["target-specific:csharp:notnull"],
  );
});

test(".NET provider preserves nested and generic target identities without metadata-name fallback", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const specialFolder = getDeclaration(systemModule, "System.Environment.SpecialFolder");
  assert.equal(specialFolder.sourceName, "SpecialFolder");
  assert.match(specialFolder.targetId, /::System\.Environment\+SpecialFolder$/u);
  assert.equal(specialFolder.metadataName, "System.Environment.SpecialFolder");
  assert.deepEqual(specialFolder.renderShape, {
    kind: "named",
    namespace: ["System"],
    name: "Environment",
    nested: [{ name: "SpecialFolder" }],
  });

  const specialFolderBinding = provider.findTargetBindingByTargetId(specialFolder.targetId);
  assert.ok(specialFolderBinding);
  assert.equal(specialFolderBinding.id, specialFolder.targetId);
  assert.equal(specialFolderBinding.csharpType.kind, "target-named");
  assert.equal(specialFolderBinding.csharpType.id, specialFolder.targetId);
  assert.deepEqual(specialFolderBinding.csharpType.csharpRender, {
    kind: "named",
    namespace: ["System"],
    name: "Environment",
    nested: [{ name: "SpecialFolder" }],
  });

  const collectionsModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Collections.Generic.js", {});
  assert.equal("exports" in collectionsModule, true);
  const dictionary = getDeclaration(collectionsModule, "System.Collections.Generic.Dictionary`2");
  assert.match(dictionary.targetId, /::System\.Collections\.Generic\.Dictionary`2$/u);
  assert.deepEqual(dictionary.typeParameters?.map((parameter) => parameter.name), ["TKey", "TValue"]);

  const dictionaryBinding = provider.findTargetBindingByTargetId(dictionary.targetId);
  assert.ok(dictionaryBinding);
  assert.equal(dictionaryBinding.id, dictionary.targetId);
  assert.deepEqual(dictionaryBinding.csharpType.typeArguments, [
    { kind: "type-parameter", name: "TKey" },
    { kind: "type-parameter", name: "TValue" },
  ]);
});

function getDeclaration(module, metadataName) {
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find((candidate) => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, `Missing .NET declaration '${metadataName}' in ${module.moduleSpecifier}`);
  return declaration;
}

function getSourceDeclaration(model, sourceName) {
  const declaration = model.exports.find((candidate) => candidate.name === sourceName);
  assert.ok(declaration, `Missing source declaration '${sourceName}' in ${model.moduleSpecifier}`);
  return declaration;
}

function getSourceMember(declaration, sourceName) {
  const member = declaration.members?.find((candidate) => candidate.name === sourceName);
  assert.ok(member, `Missing source member '${declaration.name}.${sourceName}'`);
  return member;
}

function targetConstraintKindOrName(constraint) {
  if (constraint.kind === "target-specific") {
    return `${constraint.kind}:${constraint.target}:${constraint.name}`;
  }
  if (constraint.kind === "unsupported") {
    return `${constraint.kind}:${constraint.target}:${stripAssemblyQualifiers(constraint.id).split(".").at(-1)}`;
  }
  if (constraint.kind !== "implements") {
    return constraint.kind;
  }
  return stripAssemblyQualifiers(constraint.contract).split(".").at(-1);
}

function idEndsWith(id, metadataSuffix) {
  return stripAssemblyQualifiers(id) === metadataSuffix;
}

function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}

function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstraintProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constraints"),
  });
}
