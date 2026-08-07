import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.isFile() && path.endsWith(".ts")
      ? [path]
      : [];
  });
}

test("neutral typed-location facts enter C# through one policy adapter", () => {
  const occurrences = sourceFiles(sourceRoot)
    .filter((path) => readFileSync(path, "utf8").includes("pointerOperationFactKey"))
    .map((path) => path.slice(repositoryRoot.length + 1));

  assert.deepEqual(occurrences, [
    "src/policy/operations/source-typed-locations.ts",
  ]);
});

test("C# backend consumes only resolved C# typed-location operations", () => {
  const plannerPath = join(
    sourceRoot,
    "backend/planner/expression-typed-locations.ts",
  );
  const planner = readFileSync(plannerPath, "utf8");

  assert.match(planner, /selectCsharpTypedLocationOperation/u);
  assert.doesNotMatch(
    planner,
    /pointerOperationFactKey|PointerOperationFact|sourceFacts|getResolvedStorageInfo|getResolvedPropertyAccessInfo|getResolvedElementAccessInfo/u,
  );
  assert.equal(
    existsSync(join(sourceRoot, "backend/planner/expression-pointer-operations.ts")),
    false,
  );
});

test("typed-location selection is fact-driven and contains no marker spellings", () => {
  const selection = readFileSync(
    join(sourceRoot, "policy/operations/typed-locations.ts"),
    "utf8",
  );
  assert.match(selection, /readCsharpSourceTypedLocationOperation/u);
  assert.doesNotMatch(
    selection,
    /\baddressOf\b|\ballocatePointer\b|\bloadPointer\b|\bstorePointer\b/u,
  );
  assert.doesNotMatch(selection, /getSymbolAtLocation|getResolvedSymbol|\.Text\b|\.TypeArguments\b/u);
});
