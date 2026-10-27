import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery, defaultSourceStorageLimits } from "@tsonic/target-api/analysis";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource, compileCsharpAnalysisTarget } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../../../dist/analysis/declarations/type-only.js";

function analyze(sourceText, surface = "native") {
  let source;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget: (request, observer) => {
    source = request.input.source;
    return compileCsharpAnalysisTarget(request, observer);
  } });
  assertCsharpCheckingSucceeded(compiled);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "valid source analysis");
  assert.equal(Object.hasOwn(program.records, "nativeParticipation"), true, "one published participation reader");
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  assert.equal(storage.failureReason(), undefined, "bounded owned source domain");
  return { source, ast: source.ast, nodes: storage.nodes, program, compiled };
}

function labels(value) {
  const { ast } = value;
  const participation = value.program.records.nativeParticipation;
  return value.nodes.flatMap(node => {
    const selected = participation.get(node);
    if (selected === undefined) return [];
    const name = ast.name(node);
    const parent = ast.parent(node);
    const owner = name !== undefined ? ast.text(name)
      : parent !== undefined && ast.is.IsVariableDeclaration(parent) ? ast.text(ast.name(parent)) : "";
    return [`${ast.kindName(node)}:${owner}:${selected}`];
  });
}

const ambientOriginal = active => `
declare const external: number;
export function run(): number {
  function hidden(): number { return external; }
  return ${active ? "hidden()" : "42"};
}`;
const ambientCases = [
  { name: "original dormant", sourceText: ambientOriginal(false), errors: 0, references: 1, call: "Subject.run()",
    erased: ["hidden"], forbidden: ["external", "hidden"] },
  { name: "original active", sourceText: ambientOriginal(true), errors: 1, references: 1 },
  { name: "stored callable subtree", sourceText: `declare const external: number;
    export function run(): number {
      const unused = () => { function nested(): number { return external; } return nested(); };
      void unused; return 42;
    }`, errors: 1, references: 1 },
  { name: "erased callable subtree", sourceText: `declare const external: number;
    export function run(): number {
      (() => { function nested(): number { return external; } return nested(); });
      return 42;
    }`, errors: 0, references: 1, call: "Subject.run()", erased: [], forbidden: ["external", "nested"] },
  { name: "type-only query", sourceText: `declare const external: number;
    export type External = typeof external;
    export function run(value: External): number { return value; }`, errors: 0, references: 0,
    call: "Subject.run(42D)", erased: [], forbidden: ["external"] },
  { name: "ordinary shadow", sourceText: `declare const external: number;
    export function run(): number { const external = 42; return external; }`, errors: 0, references: 0,
    call: "Subject.run()", erased: [], forbidden: [] },
  { name: "actual alias", sourceText: `declare const external: number;
    export function run(): number { const value = external; return value; }`, errors: 1, references: 1 },
  { name: "retained callback", sourceText: `declare const external: number;
    export function run(): () => number { return () => external; }`, errors: 1, references: 1 },
  { name: "actual module initializer", sourceText: `declare const external: number;
    export const value = external;`, errors: 1, references: 1 },
  { name: "distinct actual references", sourceText: `declare const external: number;
    export function run(): number { const first = external; const second = external; return first + second; }`, errors: 2, references: 2 },
];

for (const surface of ["native", "js"]) for (const example of ambientCases) test(
  `${surface} ambient implementation is required only by actual native use (${example.name})`, { timeout: 300_000 }, () => {
  const compiled = compileCsharpNativeUseSource({ sourceText: example.sourceText, surface });
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.nativeStage.source;
  const ast = source.ast;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const ambient = nodes.find(node => {
    if (!ast.is.IsVariableDeclaration(node) || ast.text(ast.name(node)) !== "external") return false;
    const list = ast.parent(node);
    const statement = list === undefined ? undefined : ast.parent(list);
    return statement !== undefined && ast.is.IsVariableStatement(statement) && ast.hasModifierKind(statement, "ambient");
  });
  assert.equal(ambient !== undefined, true, `${example.name}: the original ambient source declaration is preserved`);
  const references = source.navigation.declarationUses(ambient).filter(use => use.kind !== "type-only" && use.kind !== "source-linkage");
  assert.equal(references.length, example.references, `${example.name}: checked source references are not filtered or rewritten`);
  if (example.errors !== 0) {
    const issues = compiled.nativeStage.diagnostics;
    assert.equal(issues.length === example.errors && issues.every(issue =>
      issue.code === "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING" && issue.category === "error" && issue.source === "tsonic-csharp" &&
      issue.message === "A runtime read of an authored ambient variable requires an exact native implementation." &&
      references.some(reference => reference.reference === issue.sourceNode)), true,
    `${example.name}: every actual reference retains the original precise code, message, owner and source identity`);
    assert.equal(new Set(issues.map(issue => issue.sourceNode)).size, example.errors,
      `${example.name}: diagnostics deduplicate by actual reference, never globally by declaration`);
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      `${example.name}: an unimplemented actual native read publishes no program, plan or artifact`);
    return;
  }
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  assert.equal(program.records.compileTimeMetadata.get(ambient), true,
    `${example.name}: source-only declaration metadata remains available without an invented native binding`);
  if (example.name === "original dormant") {
    const declarations = analyzeCsharpTypeOnlyDeclarations(source, source.navigation.sourceFiles);
    assert.equal(declarations.has(ambient) && declarations.has(ast.parent(ast.parent(ambient))), true,
      "the one metadata producer preserves both original ambient declaration identities");
    assert.equal(Object.hasOwn(declarations, "issues") || Object.hasOwn(declarations, "declarations"), false,
      "the old mixed metadata/runtime-issue API is removed, not retained beside the actual-use validator");
  }
  for (const name of example.erased) {
    const declaration = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === name);
    assert.equal(declaration !== undefined && program.records.nativeParticipation.get(declaration) === "erased", true,
      `${example.name}: the canonical native participation owner, not a diagnostic filter, erases ${name}`);
  }
  for (const reference of references) assert.equal(program.records.nativeExpression.get(reference.reference) === undefined, true,
    `${example.name}: an erased checked reference is not published as a runtime native use`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  for (const name of example.forbidden) assert.equal(output.includes(name), false,
    `${example.name}: no erased body or invented ambient runtime binding for ${name}`);
  const nativeOutput = executeCsharpConstruction(compiled, `native-ambient-${surface}-${example.name.replaceAll(" ", "-")}`, false, false, [], `
    using Subject = Tsonic.Generated.Index;
    static double Native() => 42D;
    if (${example.call} != 42D) throw new System.Exception("the retained native program must return42");
    for (int index = 0; index < 20000; index++) { _ = ${example.call}; _ = Native(); }
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    double generated = 0;
    for (int index = 0; index < 20000; index++) generated += ${example.call};
    long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    double handwritten = 0;
    for (int index = 0; index < 20000; index++) handwritten += Native();
    long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten || generated != 840000D || generatedBytes != nativeBytes || nativeBytes != 0)
      throw new System.Exception("erased ambient bodies must add no native allocation or change the retained value");
    System.Console.WriteLine("actual native ambient admission passed");`);
  assert.equal(nativeOutput.includes("actual native ambient admission passed"), true,
    `${example.name}: native execution preserves42 and the exact handwritten zero-allocation cost`);
});

for (const surface of ["native", "js"]) {
  test(`${surface} native participation is decided once per callable declaration`, () => {
    const value = analyze(`
      export type Callback = (value: number) => number;
      export function overload(value: number): number;
      export function overload(value: number): number { return value; }
      export abstract class Base {
        constructor(value: number);
        constructor(value: number) {}
        abstract required(value: number): number;
        method(value: number): number;
        method(value: number): number { return value; }
        get current(): number { return 1; }
      }
      export interface Shape { required(value: number): number; optional?(value: number): number }
      export function outer(): number {
        function used(): number { return 1; }
        function unused(): number { return 2; }
        (() => 3);
        const kept = (): number => 4;
        return used() + kept();
      }
    `, surface);
    assert.deepEqual(labels(value), [
      "KindFunctionType::erased",
      "KindFunctionDeclaration:overload:erased",
      "KindFunctionDeclaration:overload:body",
      "KindConstructor::erased",
      "KindConstructor::body",
      "KindMethodDeclaration:required:signature",
      "KindMethodDeclaration:method:erased",
      "KindMethodDeclaration:method:body",
      "KindGetAccessor:current:body",
      "KindMethodSignature:required:signature",
      "KindMethodSignature:optional:erased",
      "KindFunctionDeclaration:outer:body",
      "KindFunctionDeclaration:used:body",
      "KindFunctionDeclaration:unused:erased",
      "KindArrowFunction::erased",
      "KindArrowFunction:kept:body",
    ]);
  });

  // analysis/ owns all source admission (tsonic/docs/architecture/csharp-rust-structure.md, analysis/ row): a top-level
  // namespace is refused in analysis and publishes no program, plan or artifacts (RULINGS 2026-10-22).
  test(`${surface} a top-level namespace is refused in analysis before any publication`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export namespace Space { export const one = 1; }
      export function run(): number { return 1; }
    ` });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.deepEqual(issues.map(({ code, message }) => [code, message]),
      [["CSHARP_UNSUPPORTED_AST", "Top-level statement is outside the current C# planning surface."]],
      "the namespace keeps its one source refusal");
    assert.equal(compiled.source.ast.is.IsModuleDeclaration(issues[0].sourceNode), true, "the refusal is on the namespace");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "an analysis refusal publishes no program, plan or artifacts");
  });

  test(`${surface} a local function that owns a capture frame keeps a frame body`, () => {
    const value = analyze(`
      export function f(): number {
        let total = 0;
        for (let index = 0; index < 3; index++) {
          function add(): void { total += index; }
          add();
        }
        return total;
      }
    `, surface);
    assert.deepEqual(labels(value), ["KindFunctionDeclaration:f:body", "KindFunctionDeclaration:add:frame-body"]);
  });

  test(`${surface} abstract accessors keep native signatures and concrete invocation`, { timeout: 300_000 }, () => {
    const value = analyze(`
      export abstract class Base {
        abstract get value(): number;
        abstract set value(next: number);
        abstract read(): number;
      }
      export class Concrete extends Base {
        private current = 1;
        get value(): number { return this.current; }
        set value(next: number) { this.current = next; }
        read(): number { return this.value; }
      }
      export function run(): number { const value = new Concrete(); value.value = 7; return value.read(); }
    `, surface);
    assert.deepEqual(labels(value).filter(label => label.endsWith(":signature")), [
      "KindGetAccessor:value:signature",
      "KindSetAccessor:value:signature",
      "KindMethodDeclaration:read:signature",
    ]);
    assertCsharpCompilationSucceeded(value.compiled);
    executeCsharpConstruction(value.compiled, `abstract-participation-${surface}`, false, false, [],
      'if (Tsonic.Generated.Index.run() != 7) throw new System.Exception("abstract accessor participation");');
  });
}

test("the participation lookup is sealed, stable and ignores foreign nodes", () => {
  const value = analyze("export function f(): number { (() => 1); return 2; }");
  const participation = value.program.records.nativeParticipation;
  assert.equal(Object.isFrozen(participation), true);
  const arrow = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  assert.equal(arrow !== undefined, true);
  assert.equal(participation.get(arrow), "erased");
  assert.equal(participation.get(arrow) === participation.get(arrow), true, "repeated reads are identical");
  assert.equal(participation.get({}) === undefined, true, "a foreign node has no participation");
  let inspected = 0;
  const foreign = Object.defineProperty({}, "kind", { get() { inspected += 1; throw Error("foreign source node"); } });
  assert.equal(participation.get(foreign) === undefined, true, "a foreign node has no participation");
  assert.equal(inspected, 0, "lookup does not inspect a foreign node");
  assertCsharpCompilationSucceeded(value.compiled);
});

test("participation uses the bounded unique parent-before-child source domain", () => {
  const value = analyze(`
    export function f(): number {
      (() => { const omitted = () => 9; return omitted(); });
      return 2;
    }
  `);
  const owned = new Set(value.nodes);
  const seen = new Set();
  for (const node of value.nodes) {
    assert.equal(seen.has(node), false, "each owned source node appears exactly once");
    const parent = value.ast.parent(node);
    if (owned.has(parent)) assert.equal(seen.has(parent), true, "the owning parent precedes each child");
    seen.add(node);
  }
  const arrows = value.nodes.filter(node => value.ast.is.IsArrowFunction(node));
  assert.equal(arrows.length, 2, "both erased and nested source definitions remain in the owned domain");
  assert.equal(value.program.records.nativeParticipation.get(arrows[0]), "erased");
  assert.equal(value.program.records.nativeParticipation.get(arrows[1]) === undefined, true,
    "an erased owning definition never publishes a participating nested definition");
  assertCsharpCompilationSucceeded(value.compiled);
});

for (const surface of ["native", "js"]) test(`${surface} participation excludes an unused capturing function before its descendants in any domain order`, () => {
  const value = analyze(`export function run(value: number): number {
    function unused(): () => number { return () => value + 1; }
    return value;
  }`, surface);
  const unused = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) &&
    value.ast.text(value.ast.name(node)) === "unused");
  assert.equal(unused !== undefined, true, "the unused capturing definition remains in checked source");
  const records = value.program.records;
  const descendants = [];
  const walk = node => { value.ast.forEachChild(node, child => { if (child !== undefined) { descendants.push(child); walk(child); } }); };
  walk(unused);
  const requiredRecords = [];
  const selected = analyzeCsharpNativeParticipation({ ast: value.ast,
    storage: { nodes: [...value.nodes].reverse(), failureReason: () => undefined },
    navigation: value.source.navigation,
    captureClosure: { get(node) {
      assert.equal(node === unused, false, "unusedness is decided before asking for a native frame");
      return records.captureClosure.get(node);
    } }, lambdaCreation: records.lambdaCreation, objectShapes: value.program.objectShapes,
    compileTimeMetadata: records.compileTimeMetadata, requiredRecords });
  assert.equal(selected.kind, "resolved", "the complete reverse-ordered domain resolves before publication");
  assert.equal(selected.value.participation.get(unused), "erased", "the erased root retains its single decision");
  assert.equal(descendants.every(node => selected.value.participation.get(node) === undefined), true,
    "no erased descendant receives native participation regardless of input order");
  assert.equal(requiredRecords.filter(record => record.subject === unused).length, 1, "one required decision for the erased root");
  assert.equal(requiredRecords.some(record => descendants.includes(record.subject)), false, "no descendant requirement is fabricated");
  assertCsharpCompilationSucceeded(value.compiled);
});

test("compile-time metadata excludes the whole subtree without a participation requirement", () => {
  const value = analyze("export function run(): number { const callback = () => 1; return callback(); }");
  const root = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node));
  assert.equal(root !== undefined, true, "actual checked callable metadata root");
  const records = value.program.records;
  const requiredRecords = [];
  const input = { ast: value.ast, storage: { nodes: [...value.nodes].reverse(), failureReason: () => undefined },
    navigation: value.source.navigation,
    captureClosure: records.captureClosure, lambdaCreation: records.lambdaCreation, objectShapes: value.program.objectShapes,
    compileTimeMetadata: { get: node => node === root }, requiredRecords };
  const selected = analyzeCsharpNativeParticipation(input);
  assert.equal(selected.kind, "resolved", "a complete metadata-only domain resolves before its reader is exposed");
  assert.equal(value.nodes.every(node => selected.value.participation.get(node) === undefined), true,
    "metadata is not an erased native callable publication");
  assert.equal(requiredRecords.length, 0, "metadata and descendants require no native record");
  const unresolved = analyzeCsharpNativeParticipation({ ...input,
    storage: { nodes: value.nodes.slice(1), failureReason: () => undefined } });
  assert.equal(unresolved.kind === "rejected" && !Object.hasOwn(unresolved, "value"), true,
    "an unresolved native domain cannot silently become empty or publish a participation reader");
  assert.equal(unresolved.diagnostics.length === 1 && unresolved.diagnostics[0].code === "CSHARP_NATIVE_PARTICIPATION_NOT_CLOSED" &&
    unresolved.diagnostics[0].message === "Source participation requires every checked parent in its finite source domain.", true,
    "the original missing-parent negative reports its exact expected source diagnostic instead of crashing internally");
  assert.equal(requiredRecords.length, 0, "an unresolved metadata domain publishes no fabricated requirements");
});

for (const surface of ["native", "js"]) test(`${surface} malformed or budget-exhausted participation domains reject precisely before classification`, () => {
  const value = analyze("export function run(): number { const callback = () => 1; return callback(); }", surface);
  const root = value.nodes.find(node => value.ast.is.IsSourceFile(node));
  assert.equal(root !== undefined, true, "the actual checked finite domain has its original source-file root");
  const records = value.program.records;
  const limited = createSourceStorageQuery(value.source, value.source.navigation.sourceFiles,
    { ...defaultSourceStorageLimits, maximumNodes: 1 });
  assert.equal(limited.failureReason(), "Source storage transport exceeds its finite source-node budget.",
    "the budget control uses a real bounded source-storage failure, not an invented empty domain");
  assert.equal(limited.nodes.length < value.nodes.length, true, "the resource-exhausted checked domain is actually partial");
  const validFailure = () => undefined;
  const cyclic = { ...value.ast, parent: node => node === root ? root : value.ast.parent(node) };
  for (const [label, ast, storage, reason] of [
    ["stored budget failure", value.ast, limited, limited.failureReason()],
    ["missing parent", value.ast, { nodes: value.nodes.filter(node => node !== root), failureReason: validFailure },
      "Source participation requires every checked parent in its finite source domain."],
    ["duplicate source identity", value.ast, { nodes: [...value.nodes, root], failureReason: validFailure },
      "Source participation requires one occurrence of each checked source node."],
    ["cyclic parent correspondence", cyclic, { nodes: value.nodes, failureReason: validFailure },
      "Source participation requires acyclic checked parent correspondence."],
  ]) {
    const requiredRecords = [];
    let classifications = 0;
    const rejected = analyzeCsharpNativeParticipation({ ast, storage, navigation: value.source.navigation,
      captureClosure: records.captureClosure, lambdaCreation: records.lambdaCreation,
      objectShapes: value.program.objectShapes,
      compileTimeMetadata: { get() { classifications++; return false; } }, requiredRecords });
    assert.equal(rejected.kind === "rejected" && !Object.hasOwn(rejected, "value"), true,
      `${label}: an invalid native domain has no reader or default publication`);
    assert.equal(rejected.diagnostics.length, 1, `${label}: one owning diagnostic`);
    const diagnostic = rejected.diagnostics[0];
    assert.equal(diagnostic.code, "CSHARP_NATIVE_PARTICIPATION_NOT_CLOSED", `${label}: precise pre-seal source refusal`);
    assert.equal(diagnostic.message, reason, `${label}: the exact canonical domain failure is retained`);
    assert.equal(diagnostic.category === "error" && diagnostic.source === "tsonic-csharp" &&
      diagnostic.evidence?.join() === "target.capability=csharp.native-participation", true,
      `${label}: the ordinary target-stage rejection carries the correct native capability evidence`);
    assert.equal(classifications, 0, `${label}: no source/native classifier runs on an unproven domain`);
    assert.equal(requiredRecords.length, 0, `${label}: no partial native requirement list is fabricated`);
  }
});
