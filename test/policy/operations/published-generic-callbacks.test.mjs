import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("generic native callback binding retains the actual published native result without a floating callback ABI", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const values = [3, 1, 2];
      values.sort((left, right) => left - right);
      return values[0] === 1;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const ast = program.source.ast;
  const pending = [...csharpProgramSourceFiles(program)];
  const arrows = [];
  const calls = [];
  while (pending.length > 0) {
    const node = pending.pop();
    if (ast.is.IsArrowFunction(node)) arrows.push(node);
    if (ast.is.IsCallExpression(node)) calls.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  assert.equal(arrows.length, 1);
  const signature = getCsharpDelegateSignature(program.records.nodeTargetType.get(arrows[0]));
  assert.equal(signature?.returnType.kind === "source-primitive" && signature.returnType.name === "int64", true,
    `actual callback result ${signature?.returnType.kind}:${signature?.returnType.name ?? "unavailable"}`);
  const selection = program.records.selectedCall.get(calls[0])?.target;
  assert.equal(selection?.kind === "resolved", true);
  const parameter = selection.call.arguments[0]?.targetParameter.type;
  const nativeSignature = getCsharpDelegateSignature(getCsharpNullableElementTargetType(parameter) ?? parameter);
  assert.equal(nativeSignature?.returnType.kind === "source-primitive" && nativeSignature.returnType.name === "int64", true,
    `selected native parameter result ${nativeSignature?.returnType.kind}:${nativeSignature?.returnType.name ?? "unavailable"}`);
  const emitted = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(emitted, /\bdouble\b|Convert\.|\(object\)/u);
  executeCsharpConstruction(compiled, "published-generic-callback");
});

for (const [name, sourceText] of [
  ["floating copy", "export function run(): boolean { const values: number[] = [3.5, 1.5]; const sorted = values.toSorted((left, right) => left - right); return sorted[0] === 1.5 && values[0] === 3.5; }"],
  ["readonly integer copy", 'import type { int32 } from "@tsonic/core/types.js"; export function run(values: readonly int32[]): int32[] { return values.toSorted((left, right) => left - right); }'],
  ["typed array callback", "export function run(): Uint8Array { const values = new Uint8Array(3); return values.sort((left, right) => left - right); }"],
  ["declared typed array callback", "export function run(values: Uint8Array) { return values.sort((left, right) => left - right); }"],
  ["omitted callback", "export function run(): boolean { const values = [3, 1, 2]; values.sort(); return values[0] === 1; }"],
  ["absent callback", "export function run(): boolean { const values = [3, 1, 2]; values.sort(undefined); return values[0] === 1; }"],
]) {
  test("ordinary native generic call binding preserves " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /Convert\.|\(object\)/u);
  });
}
