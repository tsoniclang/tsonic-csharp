import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDotnetProviderTelemetry } from "../../../../dist/providers/dotnet/reflection/telemetry.js";
import { resolveDotnetProviderToolPaths } from "../../../../dist/providers/dotnet/reflection/tool/path-resolution.js";
import { hashProviderToolSources, providerToolSourceFiles } from "../../../../dist/providers/dotnet/reflection/tool/source-hash.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const nativeDirectory = "tools/dotnet-type-provider";
const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const sources = new Map([
  ["members/signatures/Shared.cs", "partial class Provider { const int SignatureRevision = 0; }\n"],
  ["Shared.cs", "partial class Provider { const int Revision = 0; }\n"],
  ["members/Shared.cs", "partial class Provider { const int MemberRevision = 0; }\n"],
  ["members/support/Support.csproj", "<Project><PropertyGroup><Revision>0</Revision></PropertyGroup></Project>\n"],
  ["DotnetTypeProvider.csproj", '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><Revision>0</Revision></PropertyGroup></Project>\n'],
]);
const expectedSources = [...sources.keys()].sort();
const excludedSources = [
  "bin/Generated.cs",
  "obj/Generated.cs",
  ".temp/Generated.cs",
  "members/bin/Generated.cs",
  "members/obj/Generated.csproj",
  "members/.temp/Generated.cs",
  "members/signatures/obj/Generated.cs",
  "members/signatures/.temp/Generated.csproj",
  "members/notes.txt",
  "members/Provider.dll",
];

test("reflection-tool sources are complete, recursively ordered and independent of checkout location", () => {
  const first = fixtureDirectory("inventory-first");
  const second = fixtureDirectory("inventory-second");
  writeSources(first, sources);
  writeSources(second, [...sources].reverse());
  assert.deepEqual(relativeSources(first), expectedSources);
  assert.deepEqual(relativeSources(second), expectedSources);

  const expectedHash = createHash("sha256");
  for (const file of expectedSources) {
    expectedHash.update(file).update("\0").update(sources.get(file)).update("\0");
  }
  const digest = expectedHash.digest("hex").slice(0, 32);
  assert.equal(hashProviderToolSources(join(first, "DotnetTypeProvider.csproj")), digest);
  assert.equal(hashProviderToolSources(join(second, "DotnetTypeProvider.csproj")), digest);
});

test("nested source and project bytes, paths and membership invalidate reflection-tool identity", () => {
  const root = fixtureDirectory("identity");
  writeSources(root, sources);
  const paths = () => resolveDotnetProviderToolPaths({
    toolProjectPath: join(root, "DotnetTypeProvider.csproj"),
    toolBuildRoot: join(root, ".temp/build"),
    telemetry: createDotnetProviderTelemetry(),
  });
  const original = paths();
  const assertInvalidated = () => {
    const changed = paths();
    assert.notEqual(changed.sourceHash, original.sourceHash);
    assert.notEqual(changed.buildRoot, original.buildRoot);
    assert.notEqual(changed.dllPath, original.dllPath);
  };
  for (const [file, source] of sources) {
    writeFileSync(join(root, file), source.replace("0", "1"));
    assertInvalidated();
    writeFileSync(join(root, file), source);
    assert.deepEqual(paths(), original);
  }

  const nestedSource = "members/signatures/Shared.cs";
  const renamedSource = "members/signatures/Renamed.cs";
  renameSync(join(root, nestedSource), join(root, renamedSource));
  assertInvalidated();
  renameSync(join(root, renamedSource), join(root, nestedSource));
  assert.deepEqual(paths(), original);

  const addedSource = "members/signatures/Added.cs";
  writeSource(root, addedSource, "partial class Provider {}\n");
  assertInvalidated();
  unlinkSync(join(root, addedSource));
  assert.deepEqual(paths(), original);

  unlinkSync(join(root, nestedSource));
  assertInvalidated();
  writeSource(root, nestedSource, sources.get(nestedSource));
  assert.deepEqual(paths(), original);
});

test("generated directories at every depth and non-source files cannot contaminate tool identity", () => {
  const root = fixtureDirectory("exclusions");
  writeSources(root, sources);
  const project = join(root, "DotnetTypeProvider.csproj");
  const original = hashProviderToolSources(project);
  for (const file of excludedSources) {
    writeSource(root, file, "generated-output");
    assert.deepEqual(relativeSources(root), expectedSources);
    assert.equal(hashProviderToolSources(project), original, file);
    writeSource(root, file, "changed-output");
    assert.equal(hashProviderToolSources(project), original, file);
  }
});

test("npm packages every reflection-tool input and no generated native outputs", () => {
  const root = join(repositoryRoot, nativeDirectory);
  assert.deepEqual(
    packedNativeSources(repositoryRoot),
    relativeSources(root).map((file) => `${nativeDirectory}/${file}`).sort(),
  );
});

test("native packaging includes nested inputs, excludes outputs and rejects root-only glob regression", () => {
  const root = fixtureDirectory("package");
  const nativeRoot = join(root, nativeDirectory);
  writeSources(nativeRoot, sources);
  for (const file of excludedSources) {
    writeSource(nativeRoot, file, "generated-output");
  }
  const packageManifest = {
    name: "tsonic-native-source-inventory-fixture",
    version: "1.0.0",
    private: true,
    type: "module",
    files: manifest.files,
  };
  writeSource(root, "package.json", JSON.stringify(packageManifest));
  const expected = expectedSources.map((file) => `${nativeDirectory}/${file}`).sort();
  assert.deepEqual(packedNativeSources(root), expected);

  writeSource(root, "package.json", JSON.stringify({
    ...packageManifest,
    files: manifest.files.map((pattern) => pattern.replace("/**/*.cs", "/*.cs")),
  }));
  const incomplete = new Set(packedNativeSources(root));
  assert.deepEqual(
    expected.filter((file) => !incomplete.has(file)),
    expected.filter((file) => file.startsWith(`${nativeDirectory}/members/`)),
  );
});

function relativeSources(root) {
  return providerToolSourceFiles(root).map((file) => relative(root, file).split(sep).join("/"));
}

function fixtureDirectory(label) {
  const parent = join(repositoryRoot, ".temp/dotnet-provider-tool-sources");
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, `${label}-`));
}

function writeSources(root, files) {
  for (const [file, source] of files) {
    writeSource(root, file, source);
  }
}

function writeSource(root, file, source) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function packedNativeSources(root) {
  const packed = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(packed.error, undefined);
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);
  const [artifact] = JSON.parse(packed.stdout);
  return artifact.files.map(({ path }) => path)
    .filter((file) => file.startsWith(`${nativeDirectory}/`))
    .sort();
}
