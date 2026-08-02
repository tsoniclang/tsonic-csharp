import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  obsoleteTargetFactTests,
  replacementContracts,
} from "./distant-lands-test-migration-ledger.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("every deleted target-fact test is hash-anchored to surviving source contracts", () => {
  assert.equal(obsoleteTargetFactTests.length, 62);
  assert.equal(
    obsoleteTargetFactTests.reduce((total, entry) => total + entry.testCount, 0),
    598,
  );
  assert.equal(
    new Set(obsoleteTargetFactTests.map((entry) => entry.path)).size,
    obsoleteTargetFactTests.length,
  );

  for (const entry of obsoleteTargetFactTests) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u, entry.path);
    assert.equal(existsSync(resolve(repositoryRoot, entry.path)), false, entry.path);
    assert.ok(entry.contracts.length > 0, entry.path);
    for (const contractId of entry.contracts) {
      assert.notEqual(replacementContracts[contractId], undefined, `${entry.path}: ${contractId}`);
    }
  }
});

test("every replacement contract has source syntax and executable proof files", () => {
  for (const [contractId, contract] of Object.entries(replacementContracts)) {
    assert.match(contract.example, /[;{}]/u, contractId);
    assert.ok(contract.proofs.length > 0, contractId);
    for (const proof of contract.proofs) {
      const proofPath = resolve(repositoryRoot, proof);
      assert.equal(existsSync(proofPath), true, `${contractId}: ${proof}`);
      assert.match(proofPath, /\.test\.mjs$/u, `${contractId}: ${proof}`);
    }
  }
});

test("every retained C# test module has resolvable local imports", () => {
  const testRoot = resolve(repositoryRoot, "test");
  const files = walk(testRoot).filter((path) => path.endsWith(".mjs"));
  const unresolved = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...source.matchAll(
        /^(?:import|export)\s+[^;]*?\sfrom\s+["'](?<specifier>\.[^"']+)["'];/gmu,
      ),
      ...source.matchAll(
        /^import\s*["'](?<specifier>\.[^"']+)["'];/gmu,
      ),
    ].map((match) => match.groups.specifier);
    for (const specifier of specifiers) {
      if (specifier.startsWith(".") && !existsSync(resolve(dirname(file), specifier))) {
        unresolved.push(`${file.slice(repositoryRoot.length + 1)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(unresolved, []);
});

test("deleted target-fact architecture cannot return through product or tests", () => {
  const roots = [resolve(repositoryRoot, "src")];
  const banned = [
    "csharp-facts.js",
    "csharp-target-operations.js",
    "SelectedTargetSignatureFact",
    "TargetOperationFact",
    "targetOperationFactKey",
    "deferObservation",
    "safeGetTypeFromTypeNode",
    "safeGetTypeAtLocation",
  ];
  const violations = [];
  for (const file of roots.flatMap(walk).filter((path) => /\.(?:ts|mjs)$/u.test(path))) {
    const source = readFileSync(file, "utf8");
    for (const token of banned) {
      if (source.includes(token)) {
        violations.push(`${file.slice(repositoryRoot.length + 1)}: ${token}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
