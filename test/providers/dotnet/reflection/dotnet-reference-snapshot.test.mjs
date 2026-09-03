import assert from "node:assert/strict";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionCacheRequest,
} from "../../../../dist/providers/dotnet/reflection/cache-request.js";
import {
  createDotnetProviderCache,
} from "../../../../dist/providers/dotnet/reflection/cache.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../../../helpers/dotnet-reflection-provider.mjs";
import {
  createDotnetReferenceSnapshot,
} from "../../../../dist/providers/dotnet/reflection/reference-snapshot.js";
import {
  createDotnetProviderTelemetry,
} from "../../../../dist/providers/dotnet/reflection/telemetry.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
let fixtureSequence = 0;

function fixtureDirectory(name) {
  fixtureSequence += 1;
  const directory = join(
    repoRoot,
    ".temp/dotnet-reference-snapshot",
    `${Date.now()}-${process.pid}-${fixtureSequence}-${name}`,
  );
  mkdirSync(directory, { recursive: true });
  return directory;
}

function makeReferenceDirectory(name) {
  const directory = fixtureDirectory(name);
  writeFileSync(join(directory, "Alpha.dll"), "alpha-assembly-bytes");
  writeFileSync(join(directory, "Beta.dll"), "beta-assembly-bytes");
  return directory;
}

function cacheRequest(referenceSnapshot) {
  return createDotnetReflectionCacheRequest({
    specifier: "@tsonic/dotnet/System.js",
    namespaceName: "System",
    context: { materialization: { kind: "complete" } },
    options: {},
    toolIdentity: {
      projectPath: "/provider/Provider.csproj",
      sourceHash: "hash",
      dllPath: "/provider/Provider.dll",
    },
    referenceSnapshot,
  });
}

test("reference bytes are hashed exactly once and reused by every cache request in a provider session", () => {
  const directory = makeReferenceDirectory("hash-once");
  const telemetry = createDotnetProviderTelemetry();
  const snapshot = createDotnetReferenceSnapshot({
    referenceDirectory: directory,
    references: [],
    telemetry,
  });

  const digests = [];
  for (let index = 0; index < 250; index += 1) {
    digests.push(cacheRequest(snapshot).referenceSnapshotDigest);
    assert.equal(snapshot.verify(), undefined);
  }

  assert.deepEqual([...new Set(digests)], [snapshot.digest]);
  const counters = telemetry.snapshot();
  assert.equal(counters.referenceSnapshotComputations, 1);
  assert.equal(counters.referenceSnapshotUniqueFiles, 2);
  assert.equal(
    counters.referenceSnapshotHashedBytes,
    "alpha-assembly-bytes".length + "beta-assembly-bytes".length,
  );
  assert.equal(counters.referenceSnapshotVerifications, 250);
});

test("reference content determines the snapshot digest even when file size is unchanged", () => {
  const directory = makeReferenceDirectory("content-digest");
  const first = createDotnetReferenceSnapshot({ referenceDirectory: directory, references: [] });
  const second = createDotnetReferenceSnapshot({ referenceDirectory: directory, references: [] });
  assert.equal(first.digest, second.digest);
  assert.equal(first.uniqueFileCount, 2);

  writeFileSync(join(directory, "Alpha.dll"), "ALPHA-ASSEMBLY-BYTES");
  const third = createDotnetReferenceSnapshot({ referenceDirectory: directory, references: [] });
  assert.equal(first.hashedBytes, third.hashedBytes);
  assert.notEqual(first.digest, third.digest);
});

test("reference file and directory-membership mutations fail closed", () => {
  const contentDirectory = makeReferenceDirectory("content-mutation");
  const contentSnapshot = createDotnetReferenceSnapshot({
    referenceDirectory: contentDirectory,
    references: [],
  });
  writeFileSync(join(contentDirectory, "Alpha.dll"), "alpha-assembly-bytes-mutated");
  assert.deepEqual(contentSnapshot.verify(), {
    path: join(contentDirectory, "Alpha.dll"),
    reason: "reference assembly changed during compilation",
  });

  const membershipDirectory = makeReferenceDirectory("membership-mutation");
  const membershipSnapshot = createDotnetReferenceSnapshot({
    referenceDirectory: membershipDirectory,
    references: [],
  });
  writeFileSync(join(membershipDirectory, "Gamma.dll"), "gamma-assembly-bytes");
  assert.deepEqual(membershipSnapshot.verify(), {
    path: membershipDirectory,
    reason: "reference directory assembly membership changed during compilation",
  });
});

test("the reflection provider rejects a mutated reference set before cache or tool use", () => {
  const directory = makeReferenceDirectory("provider-mutation");
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    referenceDirectory: directory,
    disablePersistentCache: true,
    telemetry,
  });
  writeFileSync(join(directory, "Alpha.dll"), "alpha-assembly-bytes-mutated");

  const result = provider.getModule("@tsonic/dotnet/System.js", {
    materialization: { kind: "complete" },
  });

  assert.equal(result.code, "DOTNET_REFLECTION_REFERENCES_MUTATED");
  assert.equal(telemetry.snapshot().toolInvocations, 0);
  assert.equal(telemetry.snapshot().memoryCacheHits, 0);
});

test("the snapshot is the single canonical source of reflection-tool reference arguments", () => {
  const directory = makeReferenceDirectory("tool-arguments");
  const explicitReference = join(directory, "Explicit.dll");
  writeFileSync(explicitReference, "explicit-assembly-bytes");
  const snapshot = createDotnetReferenceSnapshot({
    referenceDirectory: directory,
    references: [explicitReference, explicitReference],
  });
  const args = [];

  snapshot.appendToolArguments(args);

  assert.deepEqual(args, [
    "--reference-dir",
    resolve(directory),
    "--reference",
    resolve(explicitReference),
  ]);
});

test("corrupt persistent cache records self-recover without manual deletion", () => {
  const cacheRoot = fixtureDirectory("corrupt-cache");
  const telemetry = createDotnetProviderTelemetry();
  const cache = createDotnetProviderCache(cacheRoot, telemetry);
  const request = cacheRequest(createDotnetReferenceSnapshot({
    referenceDirectory: undefined,
    references: [],
  }));
  const model = { moduleSpecifier: "@tsonic/dotnet/System.js", namespaceName: "System", exports: [] };

  cache.writeModule(request, model);
  assert.deepEqual(cache.readModule(request), model);
  const [cacheFile] = readdirSync(cacheRoot);
  assert.equal(typeof cacheFile, "string");
  writeFileSync(join(cacheRoot, cacheFile), "{ corrupt json");

  assert.equal(cache.readModule(request), undefined);
  assert.deepEqual(readdirSync(cacheRoot), []);
  assert.equal(telemetry.snapshot().diskCacheFailures, 1);
  assert.equal(telemetry.snapshot().diskCacheDisables, 0);

  cache.writeModule(request, model);
  assert.deepEqual(cache.readModule(request), model);
});

test("persistent cache I/O failure disables only the cache and never the provider path", () => {
  const fixtureRoot = fixtureDirectory("cache-io-failure");
  const cacheRoot = join(fixtureRoot, "not-a-directory");
  writeFileSync(cacheRoot, "occupied");
  const telemetry = createDotnetProviderTelemetry();
  const cache = createDotnetProviderCache(cacheRoot, telemetry);
  const request = cacheRequest(createDotnetReferenceSnapshot({
    referenceDirectory: undefined,
    references: [],
  }));
  const model = { moduleSpecifier: "@tsonic/dotnet/System.js", namespaceName: "System", exports: [] };

  assert.doesNotThrow(() => cache.writeModule(request, model));
  assert.equal(cache.readModule(request), undefined);
  assert.equal(telemetry.snapshot().diskCacheFailures, 1);
  assert.equal(telemetry.snapshot().diskCacheDisables, 1);
});
