import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
} from "../dist/providers/dotnet/reflection/provider.js";
import {
  referenceDirectoryIdentities,
  referenceIdentities,
} from "../dist/providers/dotnet/reflection/tool.js";
import {
  readCsharpReferences,
  readCsharpReflectionReferencePaths,
} from "../dist/options/csharp-target-options.js";
import {
  resolveDotnetFrameworkReferenceAssemblies,
} from "../dist/options/dotnet-framework-reference-packs.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("C# framework references resolve through active SDK targeting packs", () => {
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
  }, repoRoot);

  assert.deepEqual(references.slice(0, 2), [
    resolve(repoRoot, "../lib/Acme.Contracts.dll"),
    resolve(repoRoot, "../lib/Direct.Contracts.dll"),
  ]);
  const frameworkReferences = references.slice(2);
  assert.notEqual(frameworkReferences[0], undefined);
  const frameworkDirectory = dirname(frameworkReferences[0]);
  assert.deepEqual(
    [...new Set(frameworkReferences.map((reference) => dirname(reference)))],
    [frameworkDirectory],
  );
  assert.match(frameworkDirectory, /\/packs\/Microsoft\.AspNetCore\.App\.Ref\//u);
  assert.doesNotMatch(frameworkDirectory, /\/shared\/Microsoft\.AspNetCore\.App\//u);
  assert.deepEqual(
    frameworkReferences,
    readdirSync(frameworkDirectory)
      .filter((fileName) => fileName.endsWith(".dll"))
      .map((fileName) => join(frameworkDirectory, fileName))
      .sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(
    frameworkReferences.filter((reference) =>
      reference.endsWith("/Microsoft.AspNetCore.Http.dll")
    ).length,
    1,
  );
});

test(".NET reflection provider reads active SDK targeting-pack assemblies as metadata", () => {
  const references = readCsharpReflectionReferencePaths({
    id: "csharp",
    options: {
      references: {
        frameworks: ["Microsoft.AspNetCore.App"],
      },
    },
  }, repoRoot);
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references,
  });
  const module = provider.getModule("@tsonic/dotnet/Microsoft.AspNetCore.Http.js", {
    requestedExports: ["HttpContext"],
  });

  assert.equal("exports" in module, true, JSON.stringify(module));
  const httpContext = module.exports.find((declaration) => declaration.sourceName === "HttpContext");
  assert.equal(httpContext?.metadataName, "Microsoft.AspNetCore.Http.HttpContext");
  assert.equal(httpContext?.assembly.name, "Microsoft.AspNetCore.Http.Abstractions");
  assert.equal(
    httpContext?.targetId,
    `${httpContext?.assembly.name}, Version=${httpContext?.assembly.version}, Culture=neutral, PublicKeyToken=${httpContext?.assembly.publicKeyToken}::${httpContext?.metadataName}`,
  );
  assert.match(httpContext?.assembly.path ?? "", /\/packs\/Microsoft\.AspNetCore\.App\.Ref\//u);
  const responseMembers = httpContext?.members?.filter((member) =>
    member.sourceName === "Response"
  );
  assert.equal(responseMembers?.length, 1);
  assert.deepEqual(
    {
      kind: responseMembers?.[0]?.kind,
      sourceName: responseMembers?.[0]?.sourceName,
      targetName: responseMembers?.[0]?.targetName,
      readable: responseMembers?.[0]?.readable,
      metadataName: responseMembers?.[0]?.metadataName,
    },
    {
      kind: "property",
      sourceName: "Response",
      targetName: "Response",
      readable: true,
      metadataName: "Microsoft.AspNetCore.Http.HttpContext.Response",
    },
  );
});

test(".NET targeting-pack selection follows the exact active SDK without version sorting", () => {
  const calls = [];
  const host = {
    runDotnet(args, cwd) {
      calls.push({ args: [...args], cwd });
      if (args[0] === "--version") {
        return { status: 0, stdout: "10.0.100-preview.7.1\n", stderr: "" };
      }
      if (args[0] === "--list-sdks") {
        return {
          status: 0,
          stdout: [
            "10.0.100 [/sdks]",
            "11.0.100 [/sdks]",
            "10.0.100-preview.7.1 [/preview-sdks]",
          ].join("\n"),
          stderr: "",
        };
      }
      assert.deepEqual(args, [
        "msbuild",
        "/preview-sdks/10.0.100-preview.7.1/Microsoft.NETCoreSdk.BundledVersions.props",
        "-nologo",
        "-getProperty:NetCoreTargetingPackRoot",
        "-getItem:KnownFrameworkReference",
      ]);
      return {
        status: 0,
        stdout: JSON.stringify({
          Properties: { NetCoreTargetingPackRoot: "/packs" },
          Items: {
            KnownFrameworkReference: [{
              Identity: "Acme.Framework",
              TargetFramework: "net10.0",
              TargetingPackName: "Acme.Framework.Ref",
              TargetingPackVersion: "10.0.0-preview.7.1",
            }],
          },
        }),
        stderr: "",
      };
    },
    isFile(path) {
      return path === "/preview-sdks/10.0.100-preview.7.1/Microsoft.NETCoreSdk.BundledVersions.props";
    },
    readAssemblyDirectory(path) {
      assert.equal(path, "/packs/Acme.Framework.Ref/10.0.0-preview.7.1/ref/net10.0");
      return [`${path}/Zeta.dll`, `${path}/Alpha.dll`];
    },
  };

  assert.deepEqual(
    resolveDotnetFrameworkReferenceAssemblies(
      ["Acme.Framework"],
      "net10.0",
      "/project",
      host,
    ),
    [
      "/packs/Acme.Framework.Ref/10.0.0-preview.7.1/ref/net10.0/Alpha.dll",
      "/packs/Acme.Framework.Ref/10.0.0-preview.7.1/ref/net10.0/Zeta.dll",
    ],
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.cwd), [
    "/project",
    "/project",
    "/project",
  ]);
});

test(".NET targeting-pack selection fails closed for an unsupported target framework", () => {
  const host = deterministicFrameworkHost({ targetFramework: "net10.0" });
  assert.throws(
    () => resolveDotnetFrameworkReferenceAssemblies(
      ["Acme.Framework"],
      "netbanana",
      "/project",
      host,
    ),
    /does not define framework reference 'Acme\.Framework' for target framework 'netbanana'/u,
  );
});

test(".NET targeting-pack selection fails closed when the selected reference pack is missing", () => {
  const host = deterministicFrameworkHost({ targetFramework: "net10.0", missingPack: true });
  assert.throws(
    () => resolveDotnetFrameworkReferenceAssemblies(
      ["Acme.Framework"],
      "net10.0",
      "/project",
      host,
    ),
    /targeting pack reference directory.*missing or contains no assemblies/u,
  );
});

test("C# provider references are reflection-only provider inputs", () => {
  const referenceDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/provider-reference-options");
  mkdirSync(referenceDirectory, { recursive: true });
  const providerOnlyAssembly = join(referenceDirectory, "ProviderOnly.dll");
  writeFileSync(providerOnlyAssembly, "");

  const target = {
    id: "csharp",
    options: {
      references: {
        assemblies: [{ include: "Project.Assembly", hintPath: "../lib/Project.Assembly.dll" }],
      },
      providerReferences: {
        directories: [relative(repoRoot, referenceDirectory)],
      },
    },
  };

  assert.deepEqual(readCsharpReflectionReferencePaths(target, repoRoot), [
    resolve(repoRoot, "../lib/Project.Assembly.dll"),
    providerOnlyAssembly,
  ]);
  assert.deepEqual(readCsharpReferences(target), [
    { kind: "assembly", include: "Project.Assembly", hintPath: "../lib/Project.Assembly.dll" },
  ]);
});

function deterministicFrameworkHost({ targetFramework, missingPack = false }) {
  return {
    runDotnet(args) {
      if (args[0] === "--version") {
        return { status: 0, stdout: "10.0.100\n", stderr: "" };
      }
      if (args[0] === "--list-sdks") {
        return { status: 0, stdout: "10.0.100 [/sdks]\n", stderr: "" };
      }
      return {
        status: 0,
        stdout: JSON.stringify({
          Properties: { NetCoreTargetingPackRoot: "/packs" },
          Items: {
            KnownFrameworkReference: [{
              Identity: "Acme.Framework",
              TargetFramework: targetFramework,
              TargetingPackName: "Acme.Framework.Ref",
              TargetingPackVersion: "10.0.0",
            }],
          },
        }),
        stderr: "",
      };
    },
    isFile(path) {
      return path === "/sdks/10.0.100/Microsoft.NETCoreSdk.BundledVersions.props";
    },
    readAssemblyDirectory(path) {
      return missingPack ? undefined : [`${path}/Acme.Framework.dll`];
    },
  };
}

test(".NET provider cache fingerprints reference contents rather than mutable path metadata", () => {
  const referenceDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/cache-content-identity");
  mkdirSync(referenceDirectory, { recursive: true });
  const reference = join(referenceDirectory, "Mutable.dll");
  writeFileSync(reference, "AAAA");
  const firstFileIdentity = referenceIdentities([reference]);
  const firstDirectoryIdentity = referenceDirectoryIdentities(referenceDirectory);

  writeFileSync(reference, "BBBB");
  const secondFileIdentity = referenceIdentities([reference]);
  const secondDirectoryIdentity = referenceDirectoryIdentities(referenceDirectory);

  assert.notDeepEqual(secondFileIdentity, firstFileIdentity);
  assert.notDeepEqual(secondDirectoryIdentity, firstDirectoryIdentity);
  assert.equal(firstFileIdentity[0].size, secondFileIdentity[0].size);
  assert.notEqual(firstFileIdentity[0].sha256, secondFileIdentity[0].sha256);
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

test(".NET reflection provider resolves transitive assemblies from the explicit reference set", () => {
  const references = completeReferenceSet();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references,
  });
  const module = provider.getModule("@tsonic/dotnet/MissingReference.Consumer.js", {
    requestedExports: ["BrokenConsumer"],
  });

  assert.equal("exports" in module, true, JSON.stringify(module));
  assert.deepEqual(module.exports.map((declaration) => declaration.sourceName), ["BrokenConsumer"]);
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

function completeReferenceSet() {
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/missing-reference-dependency/source");
  const consumerAssembly = buildDotnetFixture({
    project: join(repoRoot, "test/fixtures/dotnet-provider/missing-reference-dependency/MissingReference.Consumer/MissingReference.Consumer.csproj"),
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/missing-reference-dependency"),
    outputDirectory,
    intermediateDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/missing-reference-dependency/obj/"),
    outputAssemblyName: "MissingReference.Consumer.dll",
  });
  return [
    consumerAssembly,
    join(outputDirectory, "MissingReference.Dependency.dll"),
  ];
}
