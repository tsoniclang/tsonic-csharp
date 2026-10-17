import assert from "node:assert/strict";
import test from "node:test";
import { readTargetParityInventory, targetReferenceFindings } from "../../../tsonic/test/architecture/tooling/target-parity-inventory.mjs";
import { fileURLToPath } from "node:url";
import { inspectCarrierRegistrySource, readCarrierDivergenceRegister,
  readCarrierRegistrySourceFiles } from "../../../tsonic/test/helpers/carrier-registry.mjs";

test("shared C#/Rust structural references remain resolvable, not an execution-parity claim", () => {
  assert.deepEqual(targetReferenceFindings(readTargetParityInventory("language-lanes")), []);
});

test("C# carrier counterpart data has the same inert source contract as Rust", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const proof = inspectCarrierRegistrySource(await readCarrierRegistrySourceFiles(root), await readCarrierDivergenceRegister());
  assert.equal(proof.modules.length, 5, "four literal registries and their pure aggregate");
  assert.equal(proof.failures.length, 0, proof.failures.join("\n"));
});
