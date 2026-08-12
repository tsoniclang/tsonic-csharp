import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const architectureTestPath = fileURLToPath(import.meta.url);

const neutralFactReaders = new Map([
  ["argumentPassingFactKey", ["src/policy/members/argument-selection.ts"]],
  ["defaultValueFactKey", ["src/policy/types/source-markers.ts"]],
  ["fieldFactKey", ["src/policy/types/source-markers.ts"]],
  ["flowStateFactKey", ["src/policy/operations/source-flow.ts"]],
  ["functionPointerFactKey", ["src/policy/types/source-markers.ts"]],
  ["pointerFactKey", ["src/policy/types/source-markers.ts"]],
  ["pointerOperationFactKey", ["src/policy/operations/source-typed-locations.ts"]],
  ["structFactKey", ["src/policy/types/source-markers.ts"]],
  ["tsonicNativePointerOperationFactKey", ["src/policy/operations/source-native-pointers.ts"]],
  ["tsonicSafetyBuilderFactKey", ["src/policy/operations/source-explicit-safety.ts"]],
  ["tsonicUnsafeContextFactKey", ["src/policy/operations/source-explicit-safety.ts"]],
  ["tsonicAttributeBuilderFactKey", ["src/translate/attributes/application-fact-index.ts"]],
]);

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

test("every neutral marker fact enters C# through one target-owned adapter", () => {
  const files = sourceFiles(sourceRoot);
  for (const [factKey, expectedFiles] of neutralFactReaders) {
    const occurrences = files
      .filter((path) => readFileSync(path, "utf8").includes(factKey))
      .map((path) => path.slice(repositoryRoot.length + 1));
    assert.deepEqual(occurrences, expectedFiles, factKey);
  }
});

test("C# backend consumes target-owned marker models only", () => {
  const forbidden = [
    ...neutralFactReaders.keys(),
    "ArgumentPassingFact",
    "DefaultValueFact",
    "FieldFact",
    "FunctionPointerFact",
    "PointerFact",
    "StructFact",
    "TsonicAttributeApplicationFact",
    "TsonicAttributeBuilderFact",
    "TsonicNativePointerOperationFact",
    "TsonicSafetyApplicationFact",
    "TsonicSafetyBuilderFact",
    "TsonicUnsafeContextFact",
  ];
  const failures = sourceFiles(join(sourceRoot, "backend"))
    .flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return forbidden
        .filter((name) => text.includes(name))
        .map((name) => `${path.slice(repositoryRoot.length + 1)}: ${name}`);
    });
  assert.deepEqual(failures, []);
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
    /\baddressOf\b|\ballocatePointer\b|\bequalPointer\b|\bloadPointer\b|\bstorePointer\b/u,
  );
  assert.doesNotMatch(selection, /getSymbolAtLocation|getResolvedSymbol|\.Text\b|\.TypeArguments\b/u);
});

test("typed-location storage identity is closed over exact declarations, members, and arrays", () => {
  const storage = readFileSync(
    join(sourceRoot, "policy/operations/typed-location-storage.ts"),
    "utf8",
  );
  const planner = readFileSync(
    join(sourceRoot, "backend/planner/expression-typed-locations.ts"),
    "utf8",
  );

  assert.match(storage, /outputIdentities\.resolveRequired/u);
  assert.doesNotMatch(storage, /sourceNodeIdentity/u);
  assert.match(storage, /receiverType\.kind !== "array"/u);
  assert.doesNotMatch(
    storage,
    /EqualityComparer|ProjectElement|ElementLocationIdentity|getTypeAtLocation|getSymbolAtLocation|getResolvedSymbol|\.Text\b|\.TypeArguments\b/u,
  );
  assert.match(planner, /CreateLocal/u);
  assert.match(planner, /CreateStatic/u);
  assert.match(planner, /CreateMember/u);
  assert.match(planner, /CreateArrayElement/u);
  assert.match(planner, /ProjectMember/u);
  assert.doesNotMatch(planner, /ProjectElement|EqualityComparer/u);
});

test("C#-flavoured aliases are never imported from the neutral module", () => {
  const failures = [
    ...authoredFiles(sourceRoot),
    ...authoredFiles(join(repositoryRoot, "test")),
  ]
    .filter((path) => path !== architectureTestPath)
    .flatMap((path) => forbiddenNeutralAliasImports(path));
  assert.deepEqual(failures, []);
});

function authoredFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return authoredFiles(path);
    }
    return entry.isFile() && /\.(?:mjs|ts)$/u.test(path) ? [path] : [];
  });
}

function forbiddenNeutralAliasImports(path) {
  const text = readFileSync(path, "utf8");
  const failures = [];
  const imports = text.matchAll(
    /(?:import|export)\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']@tsonic\/core\/(lang|types)\.js["']/gu,
  );
  for (const match of imports) {
    const forbidden = match[2] === "lang"
      ? new Set(["out", "ref", "inref", "borrow", "borrowMut", "defaultof"])
      : new Set(["ptr", "fnptr"]);
    for (const binding of match[1].split(",")) {
      const importedName = binding
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)[0];
      if (forbidden.has(importedName)) {
        failures.push(
          `${path.slice(repositoryRoot.length + 1)}: ${importedName}`,
        );
      }
    }
  }
  return failures;
}
