import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
} from "../dist/providers/dotnet/reflection/provider.js";
import {
  readCsharpReflectionReferencePaths,
} from "../dist/options/csharp-target-options.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("C# framework references do not become reflection reference paths", () => {
  const references = readCsharpReflectionReferencePaths({
    id: "csharp",
    options: {
      references: {
        frameworks: ["Microsoft.AspNetCore.App"],
        assemblies: [
          { include: "Acme.Contracts", hintPath: "../lib/Acme.Contracts.dll" },
          { include: "../lib/Direct.Contracts.dll" },
        ],
      },
    },
  });

  assert.deepEqual(references, ["../lib/Acme.Contracts.dll", "../lib/Direct.Contracts.dll"]);
});

test("C# reflection framework policy has no installed-runtime version selector", () => {
  const optionsSource = readFileSync(join(repoRoot, "src/options/csharp-target-options.ts"), "utf8");

  assert.doesNotMatch(optionsSource, /--list-runtimes/u);
  assert.doesNotMatch(optionsSource, /readCsharpFrameworkReferenceRuntimeAssemblies/u);
  assert.doesNotMatch(optionsSource, /selectDotnetRuntimeForFrameworkReference/u);
  assert.doesNotMatch(optionsSource, /targetFrameworkMajor/u);
  assert.doesNotMatch(optionsSource, /compareVersion/u);
});

test(".NET reflection provider rejects unparseable target frameworks instead of drifting", () => {
  const provider = createDotnetReflectionTypeDataProvider({ targetFramework: "netbanana" });
  const module = provider.getModule("@tsonic/dotnet/System.js", {});

  assert.equal(module.code, "DOTNET_REFLECTION_TARGET_FRAMEWORK_UNSUPPORTED");
  assert.match(module.message, /target framework is not supported/u);
  assert.match(JSON.stringify(module.evidence), /net10\.0/u);
  assert.match(JSON.stringify(module.evidence), /netbanana/u);
});

test(".NET reflection provider does not partially accept ReflectionTypeLoadException for explicit references", () => {
  const loadingSource = readFileSync(join(repoRoot, "tools/dotnet-type-provider/ReflectionProvider.Loading.cs"), "utf8");

  assert.match(loadingSource, /catch \(ReflectionTypeLoadException exception\) when \(!failOnError\)/u);
  assert.match(loadingSource, /catch \(ReflectionTypeLoadException exception\)\s*\{\s*var loaderDetails = LoaderExceptionDetails\(exception\);/u);
  assert.doesNotMatch(loadingSource, /catch \(ReflectionTypeLoadException exception\)\s*\{\s*return exception\.Types/u);
});

test(".NET reflection provider fails closed for explicit references with missing transitive assemblies", () => {
  const brokenReference = isolatedBrokenReference();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [brokenReference],
  });
  const module = provider.getModule("@tsonic/dotnet/MissingReference.Consumer.js", {});

  assert.equal(module.code, "DOTNET_REFLECTION_PROVIDER_FAILED");
  const evidence = JSON.stringify(module.evidence);
  assert.match(evidence, /Unable to read exported types from explicit \.NET reference assembly/u);
  assert.match(evidence, /MissingReference\.Dependency/u);
});

test(".NET reflection provider reports recursive delegates unsupported instead of crashing", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [recursiveDelegateFixture()],
  });
  const module = provider.getModule("@tsonic/dotnet/RecursiveDelegateFixtures.js", {
    requestedExports: ["SelfRecursive", "MutuallyRecursiveA", "MutuallyRecursiveB", "RecursiveDelegateConsumer"],
  });

  assert.equal("exports" in module, true, JSON.stringify(module));
  const unsupportedByName = new Map((module.unsupportedExports ?? []).map((declaration) => [declaration.sourceName, declaration]));
  for (const name of ["SelfRecursive", "MutuallyRecursiveA", "MutuallyRecursiveB"]) {
    assert.match(unsupportedByName.get(name)?.reason ?? "", /Recursive delegate type/u);
  }
  const consumer = module.exports.find((declaration) => declaration.sourceName === "RecursiveDelegateConsumer");
  assert.ok(consumer);
  const unsupportedUse = consumer.unsupportedMembers?.find((member) => member.targetName === "Use");
  assert.match(unsupportedUse?.reason ?? "", /Recursive delegate type/u);
});

function recursiveDelegateFixture() {
  return buildDotnetFixture({
    project: join(repoRoot, "test/fixtures/dotnet-provider/recursive-delegates/RecursiveDelegateProviderFixture.csproj"),
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/recursive-delegates"),
    outputDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/recursive-delegates"),
    intermediateDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/recursive-delegates-obj/"),
    outputAssemblyName: "RecursiveDelegateProviderFixture.dll",
  });
}

function isolatedBrokenReference() {
  const consumerAssembly = buildDotnetFixture({
    project: join(repoRoot, "test/fixtures/dotnet-provider/missing-reference-dependency/MissingReference.Consumer/MissingReference.Consumer.csproj"),
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/missing-reference-dependency"),
    outputDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/missing-reference-dependency/source"),
    intermediateDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/missing-reference-dependency/obj/"),
    outputAssemblyName: "MissingReference.Consumer.dll",
  });
  const isolatedDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/missing-reference-dependency/isolated");
  mkdirSync(isolatedDirectory, { recursive: true });
  const isolatedAssembly = join(isolatedDirectory, "MissingReference.Consumer.dll");
  copyFileSync(consumerAssembly, isolatedAssembly);
  return isolatedAssembly;
}
