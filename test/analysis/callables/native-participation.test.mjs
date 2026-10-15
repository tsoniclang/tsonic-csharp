import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { compileCsharpTarget } from "../../../dist/backend/compile.js";

function analyze(sourceText, surface = "native") {
  let source;
  let result;
  const compiled = compileCsharpSource({ sourceText, surface, compileTarget: (request, observer) => {
    source = request.input.source;
    result = analyzeCsharpTargetProgram(request);
    return compileCsharpTarget(request, observer);
  } });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(result.kind, "resolved", "valid source analysis");
  assert.equal(Object.hasOwn(result.value.records, "nativeParticipation"), true, "one published participation reader");
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  assert.equal(storage.failureReason(), undefined, "bounded owned source domain");
  return { ast: source.ast, nodes: storage.nodes, result, compiled };
}

function labels(value) {
  const { ast } = value;
  const participation = value.result.value.records.nativeParticipation;
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
      export namespace Space { export const one = 1; }
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
      "KindModuleDeclaration:Space:erased",
      "KindFunctionDeclaration:outer:body",
      "KindFunctionDeclaration:used:body",
      "KindFunctionDeclaration:unused:erased",
      "KindArrowFunction::erased",
      "KindArrowFunction:kept:body",
    ]);
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
  const participation = value.result.value.records.nativeParticipation;
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
  assert.equal(value.result.value.records.nativeParticipation.get(arrows[0]), "erased");
  assert.equal(value.result.value.records.nativeParticipation.get(arrows[1]) === undefined, true,
    "an erased owning definition never publishes a participating nested definition");
  assertCsharpCompilationSucceeded(value.compiled);
});
