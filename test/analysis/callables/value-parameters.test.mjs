import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

test("authored this is a sealed erased receiver, never a native void parameter", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function read(this: void, thisValue: number, amount: number = 1): number { return thisValue + amount; }
    export function run(): number { return read(4); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const { ast } = program.source;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, visit); };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  const owner = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "read");
  const [receiver, first, second] = ast.parameters(owner);
  assert.equal(program.records.callableParameter.get(receiver)?.kind, "receiver", "the analysis owns receiver erasure");
  assert.equal(program.records.callableParameter.get(first)?.kind, "parameter", "thisValue is still an actual value parameter");
  assert.equal(program.records.callableParameter.get(second)?.kind, "parameter", "defaults retain their actual value parameter");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /\bvoid\s+@?this\b/u);
  assert.match(output, /read\([^)]*double thisValue/u);
});

test("erasing the pseudo parameter retains an object method's admitted receiver", () => {
  const compiled = compileCsharpSource({ sourceText: `
    const counter = { value: 4, read(this: { value: number }, amount: number): number { return this.value + amount; } };
    export function run(): number { return counter.read(3); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const { program } = compiled.result;
  const { ast } = program.source;
  const receivers = [];
  const visit = node => {
    if (ast.kindName(node) === "KindThisKeyword" || ast.kindName(node) === "KindThisExpression") receivers.push(node);
    ast.forEachChild(node, visit);
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(receivers.length, 1, "the body retains its actual receiver read");
  assert.equal(program.records.thisEmission.get(receivers[0])?.kind, "bound", "the existing receiver ABI remains selected");
});

test("an unsupported runtime-bound receiver is still refused before sealing", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function read(this: { value: number }): number { return this.value; }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message.includes("runtime-bound function receiver")), true, "a pseudo parameter never manufactures native receiver evidence");
  assert.equal(compiled.artifacts.size, 0, "the unsupported receiver emits nothing");
});
