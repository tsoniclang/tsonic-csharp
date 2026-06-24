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
const constraintModuleSpecifier = "@tsonic/dotnet/ProviderConstraintFixtures.js";

test(".NET provider exposes source-representable generic constraints while keeping target-only constraints target-only", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildConstraintFixture()] });
  const module = provider.getModule(constraintModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const rawReferenceNewTarget = getDeclaration(module, "ProviderConstraintFixtures.ReferenceNewTarget`1");
  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceReferenceNewTarget = getSourceDeclaration(sourceModel, "ReferenceNewTarget");

  assert.deepEqual(
    sourceReferenceNewTarget.typeParameters?.[0]?.constraints?.map(providerConstraintSourceName),
    ["ITagged"],
  );
  assert.equal(
    sourceReferenceNewTarget.typeParameters?.[0]?.constraints?.some((constraint) =>
      constraint.kind === "reference-type" || constraint.kind === "constructible"
    ) ?? false,
    false,
    "CLR-only class/new() constraints must remain target facts, not source virtual declarations.",
  );

  const sourceCopy = getSourceMember(sourceReferenceNewTarget, "copy");
  const sourceCopyTypeParameter = sourceCopy.signatures[0].typeParameters[0];
  assert.deepEqual(
    sourceCopyTypeParameter.constraints.map(providerConstraintSourceName).sort(),
    ["EntityBase", "ITagged"],
  );

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
});

test(".NET provider preserves nested and generic target identities without metadata-name fallback", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const specialFolder = getDeclaration(systemModule, "System.Environment.SpecialFolder");
  assert.equal(specialFolder.sourceName, "SpecialFolder");
  assert.match(specialFolder.targetId, /::System\.Environment\+SpecialFolder$/u);
  assert.equal(specialFolder.metadataName, "System.Environment.SpecialFolder");
  assert.deepEqual(specialFolder.renderShape, {
    kind: "named",
    namespace: ["System", "Environment"],
    name: "SpecialFolder",
  });

  const specialFolderBinding = provider.findTargetBindingByTargetId(specialFolder.targetId);
  assert.ok(specialFolderBinding);
  assert.equal(specialFolderBinding.id, specialFolder.targetId);
  assert.equal(specialFolderBinding.csharpType.kind, "target-named");
  assert.equal(specialFolderBinding.csharpType.id, specialFolder.targetId);
  assert.deepEqual(specialFolderBinding.csharpType.csharpRender, {
    kind: "named",
    namespace: ["System", "Environment"],
    name: "SpecialFolder",
  });

  const collectionsModule = provider.getModule("@tsonic/dotnet/System.Collections.Generic.js", {});
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

function providerConstraintSourceName(constraint) {
  if (constraint.kind === "provider-ref") {
    return constraint.name;
  }
  if (constraint.kind === "target-named" && constraint.sourceShape?.kind === "provider-ref") {
    return constraint.sourceShape.name;
  }
  return constraint.kind;
}

function targetConstraintKindOrName(constraint) {
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
  return join(outputDirectory, "ConstraintProviderFixture.dll");
}
