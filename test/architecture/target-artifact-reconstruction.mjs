import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planner = productSource("src/backend/planner/csharp-planner.ts");
const reconstruction = productSource(
  "src/backend/planner/source-file-reconstruction.ts",
);
const contracts = productSource(
  "src/backend/planner/source-file-artifact-contract.ts",
);

test("C# source artifacts use one contract-driven reconstruction path", () => {
  assert.match(planner, /reconstructCsharpSourceFiles\s*\(/u);
  assert.doesNotMatch(planner, /planSourceFilesToArtifactFixedPoint/u);
  assert.doesNotMatch(planner, /maximumPasses/u);
  assert.doesNotMatch(planner, /CSHARP_ARTIFACT_FIXED_POINT_EXHAUSTED/u);
  assert.match(reconstruction, /reconstructTargetArtifacts\s*\(/u);
  assert.match(reconstruction, /captureDependencies\s*\(/u);
  assert.match(reconstruction, /moduleReferences\s*\(/u);
  assert.match(reconstruction, /kind:\s*"retry"/u);
});

test("C# source artifact contracts separate public and implementation facets", () => {
  assert.match(contracts, /source-file-public-surface/u);
  assert.match(contracts, /source-file-implementation/u);
  assert.match(contracts, /publicCompilationUnit\s*\(/u);
  assert.doesNotMatch(contracts, /printCsharpCompilationUnit/u);
  assert.doesNotMatch(contracts, /JSON\.stringify/u);
});

function productSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
