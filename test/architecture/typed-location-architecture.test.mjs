import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(repositoryRoot, "src");
const architectureTestPath = fileURLToPath(import.meta.url);

const neutralFactReaders = new Map([
  ["argumentPassingFactKey", ["src/source/extension/arguments.ts"]],
  ["defaultValueFactKey", ["src/source/extension/markers.ts"]],
  ["fieldFactKey", ["src/source/extension/markers.ts"]],
  ["flowStateFactKey", ["src/policy/operations/flow/source-flow.ts"]],
  ["functionPointerFactKey", ["src/source/extension/markers.ts"]],
  ["pointerFactKey", ["src/source/extension/markers.ts"]],
  ["rawPointerFactKey", ["src/source/extension/markers.ts"]],
  ["rawPointerOperationFactKey", ["src/source/extension/raw-pointers.ts"]],
  ["structFactKey", ["src/source/extension/markers.ts"]],
  ["tsonicSafetyBuilderFactKey", ["src/source/extension/explicit-safety.ts"]],
  ["tsonicUnsafeContextFactKey", ["src/source/extension/explicit-safety.ts"]],
  ["createTsonicAttributeApplicationFactIndex", ["src/analysis/attributes/application-index.ts"]],
]);

// Legacy memory and pointer witnesses that carry no target contract: C# reads their Host records instead (K-2662).
const legacyMemoryPointerWitnesses = [
  "pointerOperationFactKey", "tsonicKeepAliveFactKey", "tsonicNativePointerOperationFactKey", "tsonicPointerViewFactKey",
  "tsonicRawMemoryOperationFactKey", "tsonicMemoryLayoutFactKey", "tsonicMemoryFieldLayoutFactKey",
  "tsonicMemoryLayoutQueryFactKey", "tsonicFixedArrayFactKey", "tsonicMemoryFieldBindingFactKey",
  "tsonicMemoryRecordBindingFactKey", "tsonicMemoryTypeFactKey", "TsonicMemoryLayoutFact", "TsonicRawMemoryOperationFact",
  "TsonicPointerViewFact", "TsonicNativePointerOperationFact",
];

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

test("typed-location operations enter C# as Host records through one adapter", () => {
  const failures = sourceFiles(sourceRoot).flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return legacyMemoryPointerWitnesses.filter((name) => new RegExp(`\\b${name}\\b`, "u").test(text))
      .map((name) => `${path.slice(repositoryRoot.length + 1)}: ${name}`);
  });
  assert.deepEqual(failures, []);
  const adapter = readFileSync(join(sourceRoot, "source/extension/typed-locations.ts"), "utf8");
  assert.match(adapter, /facts\.selections\.pointerOperation\(subject\)/u);
  assert.match(adapter, /csharpSourceCoreAnalyses\(facts\)\.pointers\.view\(subject\)/u);
  const occurrences = sourceFiles(sourceRoot)
    .filter((path) => readFileSync(path, "utf8").includes("selections.pointerOperation("))
    .map((path) => path.slice(repositoryRoot.length + 1));
  assert.deepEqual(occurrences, ["src/source/extension/typed-locations.ts"]);
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
    "tsonicAttributeBuilderFactKey",
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
    "backend/planner/expressions/typed-locations.ts",
  );
  const planner = readFileSync(plannerPath, "utf8");
  const analysis = readFileSync(
    join(sourceRoot, "analysis/operations/typed-locations.ts"),
    "utf8",
  );
  const planning = readFileSync(join(sourceRoot, "backend/planner/expressions/planning.ts"), "utf8");

  assert.match(analysis, /selectCsharpTypedLocationOperation/u);
  assert.equal([...planning.matchAll(/input\.program\.records\.nativeHandler\.get\(node\)/gu)].length === 1, true,
    "the expression root reads one admitted native handler");
  assert.match(planning, /case "typed-location":[\s\S]*?planCsharpTypedLocationOperation\(\s*node,\s*sourceFile/u);
  assert.match(planner, /records\.typedLocationEmission\.get\(node\)/u);
  assert.match(planner, /const operation = selected\.selection/u);
  assert.doesNotMatch(planner, /input\.program\.records\.(?:memoryBinding|nativePointer|typedLocation|jsStringConversion)\.get/u);
  assert.doesNotMatch(
    planner,
    /selectCsharpTypedLocationOperation|pointerOperationFactKey|PointerOperationFact|sourceFacts|getResolvedStorageInfo|getResolvedPropertyAccessInfo|getResolvedElementAccessInfo/u,
  );
  assert.equal(
    existsSync(join(sourceRoot, "backend/planner/expression-pointer-operations.ts")),
    false,
  );
});

test("typed-location selection is fact-driven and contains no marker spellings", () => {
  const selection = readFileSync(
    join(sourceRoot, "analysis/operations/typed-locations.ts"),
    "utf8",
  );
  assert.match(selection, /readCsharpSourceTypedLocationOperation/u);
  assert.doesNotMatch(
    selection,
    /\b(?:addressOf|allocatePointer|equalPointer|loadPointer|storePointer|addressof|allocateptr|equalptr|loadptr|storeptr)\b/u,
  );
  assert.doesNotMatch(selection, /getSymbolAtLocation|getResolvedSymbol|\.Text\b|\.TypeArguments\b/u);
});

test("typed-location storage identity is closed over exact declarations, members, and arrays", () => {
  const storage = readFileSync(
    join(sourceRoot, "analysis/storage/typed-locations.ts"),
    "utf8",
  );
  const planner = readFileSync(
    join(sourceRoot, "backend/planner/expressions/typed-locations.ts"),
    "utf8",
  );

  assert.match(storage, /sourceIdentities\.node/u);
  assert.doesNotMatch(storage, /outputIdentities/u);
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
    /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@tsonic\/core\/(lang|types)\.js["']/gu,
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

test("native backing uses one neutral identity relation without the legacy layout-demand API", () => {
  const forbidden = /\b(?:createTsonicPointerBackingDemands|TsonicPointerBackingDemand|TsonicPointerBackingDemands|createTsonicPointerBackingQueries|TsonicPointerBackingQueries|selectTsonicRawLocationOperation|selectTsonicMemoryFieldBinding|selectTsonicMemoryRecordBinding|createTsonicMemoryBindingIndex|readTsonicMemoryType|TsonicMemoryTypeIdentity|sameBackingLayout)\b/u;
  const failures = sourceFiles(sourceRoot)
    .filter(path => forbidden.test(readFileSync(path, "utf8")))
    .map(path => path.slice(repositoryRoot.length + 1));
  assert.deepEqual(failures, []);
  const analysis = readFileSync(join(sourceRoot, "analysis/source-evidence/analyze.ts"), "utf8");
  assert.match(analysis, /createCsharpPointerBackingDemands\(source, pointerStorage, types\)/u);
  assert.match(analysis, /const pointerBackingRecords = pointerBacking\.seal\(\)/u);
  assert.match(analysis, /pointerBackingUses: pointerBackingRecords\.uses/u);
  const collection = readFileSync(join(sourceRoot, "analysis/source-evidence/pointer-backing.ts"), "utf8");
  assert.match(collection, /storage\.value\(selected\.operand\.expression\)/u);
  assert.match(collection, /types\.resolvePointerStoragePointee\(producer\.storage\)/u);
  assert.match(collection, /seal\(\)\s*\{\s*return Object\.freeze\(\{ uses: Object\.freeze\(\[\.\.\.uses\]\), issues: Object\.freeze\(\[\.\.\.issues\]\) \}\)/u);
  assert.doesNotMatch(collection, /uses:\s*\(\)\s*=>/u);
  assert.doesNotMatch(collection, /createTsonicPointerBackingQueries|createTsonicPointerStorageRelation/u);
  const composition = readFileSync(join(sourceRoot, "analysis/program/analyze.ts"), "utf8");
  assert.equal([...composition.matchAll(/core\.pointerStorage\(sourceStorage\)/gu)].length, 1);
  assert.match(composition, /core\.memoryBindings/u);
  const domains = readFileSync(join(sourceRoot, "analysis/operations/pointers/storage-domain.ts"), "utf8");
  assert.match(domains, /input\.pointerStorage\.value\(expression\)/u);
  assert.match(domains, /input\.sourceStorage\.typeFor\(boundary\.subject\)/u);
  assert.match(domains, /bindings: boundary\.bindings/u);
  assert.match(domains, /input\.types\.resolvePointerStoragePointee\(producer\)/u);
  const backing = readFileSync(join(sourceRoot, "analysis/storage/native-backing.ts"), "utf8");
  assert.match(backing, /tsonicDataLayoutFactKey\.equals\(previous\.dataLayout, layout\.dataLayout\)/u);
  assert.match(backing, /csharpNativeMemoryLayoutsEqual\(previous\.layout, native\)/u);
  const neutral = readFileSync(resolve(repositoryRoot,
    "../tsonic/packages/source-core/src/pointers/storage-relation.ts"), "utf8");
  assert.match(neutral, /storage\.storageProducersFor\(subject\.subject, bindings\)/u);
  assert.doesNotMatch(neutral, /sameBackingLayout|createTsonicPointerBackingQueries|createTsonicPointerBackingDemands/u);
  assert.equal(existsSync(resolve(repositoryRoot,
    "../tsonic/packages/source-core/src/pointers/backing/declared-demands.ts")), false);
  const exports = readFileSync(resolve(repositoryRoot, "../tsonic/packages/source-core/src/public/facts.ts"), "utf8");
  assert.doesNotMatch(exports, /createTsonicDeclaredPointerBackingDemands|TsonicDeclaredPointerBackingUse/u);
});

test("scalar and scalar-array backing consumes declared geometry and only checks later descriptors", () => {
  const backing = readFileSync(join(sourceRoot, "analysis/storage/native-backing.ts"), "utf8");
  assert.match(backing, /const selected = selectCsharpDeclaredNativeMemoryLayout\(policy, operation\.pointeeType,/u);
  assert.match(backing, /declared\.stride !== layout\.stride \|\| !csharpNativeMemoryLayoutsEqual\(declared\.layout, descriptor\)/u);
  assert.match(backing, /const \{ layout: selected, stride \} = declared/u);
  assert.doesNotMatch(backing, /deferred-struct|declared\.kind === "declared" \? declared\.layout : descriptor/u);
  const owner = readFileSync(join(sourceRoot, "analysis/operations/pointers/native-memory.ts"), "utf8");
  const declared = owner.slice(owner.indexOf("export function selectCsharpDeclaredNativeMemoryLayout("),
    owner.indexOf("function csharpNativeScalarByteSize("));
  // The fixed array is a function of the Host descriptor and its occurrence (selectFixedArray(descriptor, occurrence)).
  assert.match(declared, /input\.types\.selectFixedArray\(work\.sourceType, work\.occurrence\)/u);
  assert.match(declared, /csharpNativeScalarByteSize\(work\.carrier, dataLayout\.addressWidth\)/u);
  assert.doesNotMatch(declared, /TsonicMemoryLayoutFact|TsonicMemoryLayoutRecord|byteSize|byteAlignment|layout\.stride|selectCsharpNativeMemoryLayout/u);
});



test("declared struct raw footprint consumes sealed carriers in checked declaration order", () => {
  const owner = readFileSync(join(sourceRoot, "analysis/operations/pointers/native-memory.ts"), "utf8");
  const declared = owner.slice(owner.indexOf("export function selectCsharpDeclaredNativeMemoryLayout("),
    owner.indexOf("function csharpNativeScalarByteSize("));
  assert.match(declared, /input\.projectTypes\.catalog\.definitionForTarget\(work\.carrier\)/u);
  assert.match(declared, /readCsharpSourceStruct\(input\.sourceFacts, project\.declaration\)/u);
  assert.match(declared, /for \(const field of declaration\.fields\)/u);
  assert.match(declared, /const carrier = valueRead\.get\(field\.sourceType\)\?\.value/u);
  assert.match(declared, /const offset = \(size \+ fieldAlignment - 1n\) \/ fieldAlignment \* fieldAlignment/u);
  assert.doesNotMatch(declared, /csharpNativeMemoryFieldIds|findTargetBindingByTargetId|selectCsharpNativeMemoryLayout/u);
  assert.match(owner, /completeFields\.map\(identity => usedFields\.get\(identity\)!\)/u);
  const iteration = readFileSync(join(sourceRoot, "analysis/program/iteration.ts"), "utf8");
  assert.match(iteration, /const valueReads = valueReadStages\.seal\(storageRepresentations\)/u);
  assert.match(iteration, /prepareCsharpStorage\(policy, backingEvidence, operations, storageRepresentations, valueReads\.valueRead\)/u);
});
