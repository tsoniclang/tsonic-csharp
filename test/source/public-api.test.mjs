import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("C# target entrypoints expose one API per audience", async () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(manifest.exports).sort(), [
    ".",
    "./package.json",
    "./provider",
    "./provider/dotnet",
  ]);

  const root = await import("../../dist/index.js");
  assert.deepEqual(Object.keys(root).sort(), [
    "createCsharpTargetPack",
    "createTsonicPlugin",
    "csharpTargetId",
  ]);
  assert.equal("printCsharpCompilationUnit" in root, false);
  assert.equal("createDotnetReflectionTypeDataProvider" in root, false);
  assert.equal("csharpProviderPolicyContribution" in root, false);

  const provider = await import("../../dist/public/provider.js");
  assert.equal(typeof provider.csharpProviderPolicyContribution, "function");
  assert.equal(typeof provider.csharpTargetNamedType, "function");
  assert.equal(typeof provider.targetParameter, "function");
  assert.equal("createCsharpTargetPack" in provider, false);
  assert.equal("createDotnetReflectionTypeDataProvider" in provider, false);

  const dotnet = await import("../../dist/public/provider-dotnet.js");
  assert.equal(typeof dotnet.createDotnetReflectionTypeDataProvider, "function");
  assert.equal(typeof dotnet.createDotnetSourceDeclarationProvider, "function");
  assert.equal("createCsharpTargetPack" in dotnet, false);
});
