import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery, defaultSourceStorageLimits } from "@tsonic/target-api/analysis";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource, compileCsharpAnalysisTarget } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../../../dist/analysis/declarations/type-only.js";
import { analyze, labels, ambientOriginal, ambientCases } from "./native-participation.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const example of Array.from(ambientCases).slice(0, 10)) {
test(
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
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
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
    assert.deepEqual(labels(value), ["KindFunctionDeclaration:f:body", "KindFunctionDeclaration:add:frame-body"]);
  });
}
