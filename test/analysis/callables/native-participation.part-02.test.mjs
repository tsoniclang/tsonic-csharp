import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery, defaultSourceStorageLimits } from "@tsonic/target-api/analysis";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource, compileCsharpAnalysisTarget } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../../../dist/analysis/declarations/type-only.js";
import { analyze, labels, ambientOriginal, ambientCases } from "./native-participation.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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
    assert.deepEqual(labels(value), ["KindFunctionDeclaration:f:body", "KindFunctionDeclaration:add:body"]);
    const declaration = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "add");
    assert.equal(declaration !== undefined && value.program.records.captureClosure.get(declaration) === undefined, true,
      "approved C-1420: the same original native body has no ordinary protocol frame");
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} participation excludes an unused capturing function before its descendants in any domain order`, () => {
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
    } }, callableCreation: records.callableCreation, objectShapes: value.program.objectShapes,
    compileTimeMetadata: records.compileTimeMetadata, requiredRecords });
  assert.equal(selected.kind, "resolved", "the complete reverse-ordered domain resolves before publication");
  assert.equal(selected.value.participation.get(unused), "erased", "the erased root retains its single decision");
  assert.equal(descendants.every(node => selected.value.participation.get(node) === undefined), true,
    "no erased descendant receives native participation regardless of input order");
  assert.equal(requiredRecords.filter(record => record.subject === unused).length, 1, "one required decision for the erased root");
  assert.equal(requiredRecords.some(record => descendants.includes(record.subject)), false, "no descendant requirement is fabricated");
  assertCsharpCompilationSucceeded(value.compiled);
});
}

test("compile-time metadata excludes the whole subtree without a participation requirement", () => {
  const value = analyze("export function run(): number { const callback = () => 1; return callback(); }");
  const root = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node));
  assert.equal(root !== undefined, true, "actual checked callable metadata root");
  const records = value.program.records;
  const requiredRecords = [];
  const input = { ast: value.ast, storage: { nodes: [...value.nodes].reverse(), failureReason: () => undefined },
    navigation: value.source.navigation,
    captureClosure: records.captureClosure, callableCreation: records.callableCreation, objectShapes: value.program.objectShapes,
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} malformed or budget-exhausted participation domains reject precisely before classification`, () => {
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
      captureClosure: records.captureClosure, callableCreation: records.callableCreation,
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
}
