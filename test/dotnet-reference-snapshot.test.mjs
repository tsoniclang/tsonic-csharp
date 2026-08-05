import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDotnetReferenceSnapshot,
} from "../dist/providers/dotnet/reflection/reference-snapshot.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../dist/providers/dotnet/reflection/provider.js";
import {
  createDotnetProviderTelemetry,
} from "../dist/providers/dotnet/reflection/telemetry.js";
import {
  createDotnetProviderCache,
} from "../dist/providers/dotnet/reflection/cache.js";

function makeReferenceDir() {
  const dir = mkdtempSync(join(tmpdir(), "tsonic-reference-snapshot-"));
  writeFileSync(join(dir, "Alpha.dll"), "alpha-assembly-bytes");
  writeFileSync(join(dir, "Beta.dll"), "beta-assembly-bytes");
  return dir;
}

test("reference bytes are hashed exactly once per provider session regardless of request count", () => {
  const dir = makeReferenceDir();
  try {
    const telemetry = createDotnetProviderTelemetry();
    const provider = createDotnetReflectionTypeDataProvider({
      referenceDirectory: dir,
      disablePersistentCache: true,
      telemetry,
    });

    for (let index = 0; index < 250; index += 1) {
      provider.getModule(`@tsonic/dotnet/Fake.Namespace${index}.js`, {
        materialization: { kind: "complete" },
      });
    }

    const snapshot = telemetry.snapshot();
    assert.equal(snapshot.referenceSnapshotComputations, 1);
    assert.equal(snapshot.referenceSnapshotUniqueFiles, 2);
    assert.equal(
      snapshot.referenceSnapshotHashedBytes,
      "alpha-assembly-bytes".length + "beta-assembly-bytes".length,
    );
    assert.ok(snapshot.referenceSnapshotVerifications >= 250);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("changed assembly content produces a new snapshot digest; unchanged content reuses it", () => {
  const dir = makeReferenceDir();
  try {
    const first = createDotnetReferenceSnapshot({ referenceDirectory: dir, references: [] });
    const second = createDotnetReferenceSnapshot({ referenceDirectory: dir, references: [] });
    assert.equal(first.digest, second.digest);
    assert.equal(first.uniqueFileCount, 2);

    writeFileSync(join(dir, "Alpha.dll"), "alpha-assembly-bytes-CHANGED");
    const third = createDotnetReferenceSnapshot({ referenceDirectory: dir, references: [] });
    assert.notEqual(first.digest, third.digest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reference mutation during compilation fails closed", () => {
  const dir = makeReferenceDir();
  try {
    const provider = createDotnetReflectionTypeDataProvider({
      referenceDirectory: dir,
      disablePersistentCache: true,
      telemetry: createDotnetProviderTelemetry(),
    });

    writeFileSync(join(dir, "Alpha.dll"), "alpha-assembly-bytes-MUTATED-MID-COMPILATION");

    const result = provider.getModule("@tsonic/dotnet/System.js", {
      materialization: { kind: "complete" },
    });
    assert.equal(result.code, "DOTNET_REFLECTION_REFERENCES_MUTATED");
    assert.match(result.message, /changed while the compilation was running/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt persistent cache records self-recover without manual deletion", () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "tsonic-provider-cache-"));
  try {
    const telemetry = createDotnetProviderTelemetry();
    const cache = createDotnetProviderCache(cacheRoot, telemetry);
    const request = {
      providerId: "p",
      providerVersion: "1",
      providerCacheAbiVersion: "1",
      targetFramework: "net10.0",
      moduleSpecifier: "@tsonic/dotnet/System.js",
      namespaceName: "System",
      requestedExports: undefined,
      requestedTargetIds: undefined,
      requestedMetadataNames: undefined,
      materialization: { kind: "complete" },
      broadImport: undefined,
      assemblyName: undefined,
      referenceDirectory: undefined,
      referenceSnapshotDigest: "digest",
      assemblySourcePackages: [],
      toolIdentity: { toolSourceHash: "hash" },
    };
    const model = { moduleSpecifier: "@tsonic/dotnet/System.js", namespaceName: "System", exports: [] };

    cache.writeModule(request, model);
    assert.deepEqual(cache.readModule(request), model);

    const [cacheFile] = readdirSync(cacheRoot);
    assert.ok(cacheFile);
    writeFileSync(join(cacheRoot, cacheFile), "{ corrupt json");

    assert.equal(cache.readModule(request), undefined);
    assert.deepEqual(readdirSync(cacheRoot), []);

    cache.writeModule(request, model);
    assert.deepEqual(cache.readModule(request), model);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
