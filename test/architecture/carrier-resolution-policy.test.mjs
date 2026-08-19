import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url).pathname;
const bannedOptionalCarrierQueries = Object.freeze([
  "carrierFromResolution",
  "getRuntimeCarrierForNode",
  "getResolvedCallReturnRuntimeCarrier",
  "getResolvedCallParameterRuntimeCarriers",
  "getReturnTypeCarrierFromDeclaration",
  "getInferredSignatureReturnType",
]);

test("C# backend and tests consume structured target carrier resolutions", () => {
  const failures = [];
  for (const filePath of sourceAndTestFiles()) {
    const text = readFileSync(filePath, "utf8");
    for (const banned of bannedOptionalCarrierQueries) {
      if (text.includes(banned)) {
        failures.push(`${repoRelative(filePath)}: uses legacy optional carrier query ${banned}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("recursive object-shape policies cannot re-enter the public type resolver", () => {
  const recursivePolicyFiles = [
    ...filesUnder(join(repoRoot, "src/policy/types/objects/object-shape-policy")),
    join(repoRoot, "src/policy/types/objects/binding-projection-policy.ts"),
  ].filter((filePath) => filePath.endsWith(".ts"));
  const failures = [];
  for (const filePath of recursivePolicyFiles) {
    const text = readFileSync(filePath, "utf8");
    if (/\b(?:host|input)\.types\.(?:resolveNode|resolveSelectedType|resolveType)\b/u.test(text)) {
      failures.push(`${repoRelative(filePath)}: re-enters the public type resolver from recursive shape analysis`);
    }
    if (/\bcreateCsharpTypePolicy\b/u.test(text)) {
      failures.push(`${repoRelative(filePath)}: constructs a fresh public type resolver during recursive shape analysis`);
    }
  }

  assert.deepEqual(failures, []);
});

function sourceAndTestFiles() {
  return [
    ...filesUnder(join(repoRoot, "src")),
    ...filesUnder(join(repoRoot, "test")),
  ].filter((filePath) =>
    (filePath.endsWith(".ts") || filePath.endsWith(".mjs")) &&
    filePath !== new URL(import.meta.url).pathname);
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function repoRelative(path) {
  return relative(repoRoot, path).split(sep).join("/");
}
