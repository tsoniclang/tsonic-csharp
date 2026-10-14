import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
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
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of source.navigation.sourceFiles) visit(file);
  return { ast: source.ast, nodes, result, compiled };
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
    assert.equal(value.result.kind, "resolved");
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
    assert.equal(value.result.kind, "resolved");
    assert.deepEqual(labels(value), ["KindFunctionDeclaration:f:body", "KindFunctionDeclaration:add:frame-body"]);
  });
}

test("the participation lookup is sealed, stable and ignores foreign nodes", () => {
  const value = analyze("export function f(): number { (() => 1); return 2; }");
  assert.equal(value.result.kind, "resolved");
  const participation = value.result.value.records.nativeParticipation;
  assert.equal(Object.isFrozen(participation), true);
  const arrow = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  assert.equal(arrow !== undefined, true);
  assert.equal(participation.get(arrow), "erased");
  assert.equal(participation.get(arrow) === participation.get(arrow), true, "repeated reads are identical");
  assert.equal(participation.get({}) === undefined, true, "a foreign node has no participation");
  assertCsharpCompilationSucceeded(value.compiled);
});
