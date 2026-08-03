import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  assert.match(reconstruction, /artifacts\.reconstructArtifact\s*\(/u);
  assert.doesNotMatch(reconstruction, /graph\.contract\s*\(/u);
  assert.doesNotMatch(reconstruction, /graph\.artifact\s*\(/u);
  assert.doesNotMatch(reconstruction, /graph\.dependencies\s*\(/u);
});

test("C# source artifact contracts separate public and implementation facets", () => {
  assert.match(contracts, /source-file-public-surface/u);
  assert.match(contracts, /source-file-implementation/u);
  assert.match(contracts, /publicCompilationUnit\s*\(/u);
  assert.doesNotMatch(contracts, /printCsharpCompilationUnit/u);
  assert.doesNotMatch(contracts, /JSON\.stringify/u);
});

test("direct compiler tests compare bounded target diagnostic projections", () => {
  const testRoot = new URL("../", import.meta.url);
  const files = readdirSync(testRoot, {
    encoding: "utf8",
    recursive: true,
  }).filter((path) => path.endsWith(".mjs"));
  for (const path of files) {
    assert.doesNotMatch(
      readFileSync(new URL(path, testRoot), "utf8"),
      /assert\.deepEqual\([ \t]*[A-Za-z_$][\w$]*\.result\.diagnostics(?:[ \t]*[,)]|\b(?!\.))/u,
      `${path} must project away compiler-owned source nodes before assertion formatting.`,
    );
  }
});

function productSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
