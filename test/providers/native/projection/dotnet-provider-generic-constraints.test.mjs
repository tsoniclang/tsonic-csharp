import { resolvedNativeBinding } from "../../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import assert from "node:assert/strict";
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
const constraintModuleSpecifier = "@tsonic/dotnet/ProviderConstraintFixtures.js";

test("native bound metadata round-trips actual class, interface, value, enum and delegate declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildConstraintFixture()], disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, constraintModuleSpecifier, {});
  assert.equal("exports" in module, true, "the actual native constraint fixture is loaded");
  for (const [name, expected] of [
    ["EntityBase", true], ["ITagged", false], ["NativeCategoryValue", false],
    ["NativeCategoryEnum", false], ["NativeCategoryCallback", true], ["NativeCategoryGeneric`1", true],
  ]) {
    const declaration = getDeclaration(module, `ProviderConstraintFixtures.${name}`);
    assert.equal(declaration.constraintRequiresReferenceType, expected, `${name}: native declaration evidence`);
    const binding = resolvedNativeBinding(provider.findTargetBindingByTargetId(declaration.targetId, "ordinary"));
    assert.equal(binding !== undefined, true, `${name}: the canonical binding is present`);
    assert.equal(binding.csharpType.csharpConstraintRequiresReferenceType === true, expected,
      `${name}: selected native carrier retains the actual guarantee`);
  }
  const bounds = getDeclaration(module, "ProviderConstraintFixtures.NativeCategoryBounds");
  for (const [method, expected] of [["FromBase", true], ["FromInterface", false], ["FromDelegate", true]]) {
    const member = bounds.members.find(value => value.targetName === method);
    assert.equal(member !== undefined, true, `${method}: the real native method is present`);
    const parameter = member.signatures[0].typeParameters[0];
    const bound = parameter.constraints.find(value => value.kind === "implements");
    assert.equal(bound !== undefined, true, `${method}: the actual native bound is present`);
    assert.equal(bound.contract.constraintRequiresReferenceType, expected,
      `${method}: named constraint metadata retains its native bound guarantee`);
    assert.equal(parameter.allowsRefLike, false, `${method}: native anti-constraint permission remains exact`);
  }
});

test(".NET provider projects source-compatible constraints and keeps target-only constraints in target facts", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [buildConstraintFixture()] });
  const module = getCompleteDotnetModule(provider, constraintModuleSpecifier, {});
  assert.equal("exports" in module, true);

  const rawReferenceNewTarget = getDeclaration(module, "ProviderConstraintFixtures.ReferenceNewTarget`1");
  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  const sourceReferenceNewTarget = getSourceDeclaration(sourceModel, "ReferenceNewTarget");

  assert.deepEqual(sourceReferenceNewTarget.typeParameters?.[0]?.constraints, [{
    kind: "provider-ref",
    moduleSpecifier: constraintModuleSpecifier,
    exportName: "ITagged",
  }]);

  const sourceCopy = getSourceMember(sourceReferenceNewTarget, "Copy");
  const sourceCopyTypeParameter = sourceCopy.signatures[0].typeParameters[0];
  assert.deepEqual(sourceCopyTypeParameter.constraints, [
    {
      kind: "provider-ref",
      moduleSpecifier: constraintModuleSpecifier,
      exportName: "EntityBase",
    },
    {
      kind: "provider-ref",
      moduleSpecifier: constraintModuleSpecifier,
      exportName: "ITagged",
    },
  ]);

  const binding = resolvedNativeBinding(provider.findTargetBindingByTargetId(rawReferenceNewTarget.targetId, "ordinary"));
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
    resolvedNativeBinding(provider.findTargetBindingByTargetId(rawStructTarget.targetId, "ordinary")).typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["value-type", "constructible"],
  );

  const rawUnmanagedTarget = getDeclaration(module, "ProviderConstraintFixtures.UnmanagedTarget`1");
  const sourceUnmanagedTarget = getSourceDeclaration(sourceModel, "UnmanagedTarget");
  assert.equal(sourceUnmanagedTarget.typeParameters?.[0]?.constraints, undefined);
  assert.deepEqual(
    resolvedNativeBinding(provider.findTargetBindingByTargetId(rawUnmanagedTarget.targetId, "ordinary")).typeParameters[0].constraints.map(targetConstraintKindOrName),
    ["unmanaged"],
  );

  const rawNotNullTarget = getDeclaration(module, "ProviderConstraintFixtures.NotNullTarget`1");
  const sourceNotNullTarget = getSourceDeclaration(sourceModel, "NotNullTarget");
  assert.equal(sourceNotNullTarget.typeParameters?.[0]?.constraints, undefined);
  assert.deepEqual(
    resolvedNativeBinding(provider.findTargetBindingByTargetId(rawNotNullTarget.targetId, "ordinary")).typeParameters[0].constraints.map(targetConstraintKindOrName),
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

  const specialFolderBinding = resolvedNativeBinding(provider.findTargetBindingByTargetId(specialFolder.targetId, "ordinary"));
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

  const dictionaryBinding = resolvedNativeBinding(provider.findTargetBindingByTargetId(dictionary.targetId, "ordinary"));
  assert.ok(dictionaryBinding);
  assert.equal(dictionaryBinding.id, dictionary.targetId);
  assert.deepEqual(dictionaryBinding.csharpType.typeArguments, [
    { kind: "type-parameter", identity: dictionary.typeParameters[0].identity, name: "TKey" },
    { kind: "type-parameter", identity: dictionary.typeParameters[1].identity, name: "TValue" },
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
