import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const planner = productSource("src/backend/planner/program/planning.ts");
const reconstruction = productSource(
  "src/backend/planner/artifacts/source-files.ts",
);
const contracts = productSource(
  "src/analysis/source-modules/artifacts.ts",
);

test("C# source artifacts use one contract-driven reconstruction path", () => {
  assert.match(planner, /planCsharpSourceFiles\s*\(/u);
  assert.doesNotMatch(planner, /planSourceFilesToArtifactFixedPoint/u);
  assert.doesNotMatch(planner, /maximumPasses/u);
  assert.doesNotMatch(planner, /CSHARP_ARTIFACT_FIXED_POINT_EXHAUSTED/u);
  assert.match(contracts, /analyzeSourceArtifactFiles\s*\(/u);
  assert.match(contracts, /createCsharpSourceArtifactRecords\(selected\.files\)/u);
  assert.match(reconstruction, /program\.records\.sourceArtifacts\.get\(\)/u);
  assert.match(reconstruction, /planSourceFile\(sourceFile, input, diagnostics\)/u);
  assert.doesNotMatch(reconstruction, /reconstructTargetArtifacts|captureDependencies|moduleReferences|kind:\s*"retry"|reconstructArtifact/u);
  assert.doesNotMatch(reconstruction, /graph\.contract\s*\(/u);
  assert.doesNotMatch(reconstruction, /graph\.artifact\s*\(/u);
  assert.doesNotMatch(reconstruction, /graph\.dependencies\s*\(/u);
});

test("C# source artifact contracts separate public and implementation facets", () => {
  const shared = readFileSync(new URL("../../../tsonic/packages/target-api/src/target-analysis/artifacts/source-files.ts", import.meta.url), "utf8");
  assert.match(shared, /source-file-public-surface/u);
  assert.match(shared, /source-file-implementation/u);
  assert.match(shared, /input\.navigation\.moduleReferences\(file\)/u);
  assert.match(shared, /construction\.sourceFile === file/u);
  assert.match(shared, /dependencies: Object\.freeze/u);
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
