import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { Node_Initializer } from "@tsonic/target-api/source";

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
  const values = program.records.callableDeclaration.get(owner)?.parameters;
  assert.equal(values !== undefined && !values.includes(receiver) && program.records.callableParameter.get(receiver) === undefined,
    true, "the sealed source vector excludes the pseudo receiver without a second receiver-membership record");
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

for (const annotation of ["", ": number"]) {
  test(`contextual defaults keep their value-only position after a receiver annotation (${annotation || "inferred"})`, () => {
    const compiled = compileCsharpSource({ sourceText: `
      const callback: (value?: number, label?: string) => number = function(this: void, value${annotation} = 1, label = "x") {
        return value + label.Length;
      };
      export function run(): number { return callback(); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { ast } = program.source;
    const defaults = [];
    const visit = node => {
      if (ast.is.IsParameterDeclaration(node) && Node_Initializer(ast, node) !== undefined) defaults.push(node);
      ast.forEachChild(node, visit);
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(defaults.length, 2, "both authored omission defaults remain represented");
    for (const node of defaults) {
      assert.equal(program.records.callableParameter.get(node)?.kind, "parameter", "each default belongs to an actual value slot");
      assert.equal(program.records.runtimeDefault.get(node) !== undefined, true, "the default is not lost by an off-by-one contextual lookup");
    }
  });
}

test("contextual omission defaults never manufacture a runtime-bound receiver", () => {
  const compiled = compileCsharpSource({ sourceText: `
    const callback: (value?: number) => number = function(this: { value: number }, value = 1) { return this.value + value; };
    export function run(): number { return callback(); }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message.includes("runtime-bound function receiver")), true, "the actual native receiver restriction is unchanged");
  assert.equal(compiled.artifacts.size, 0, "a default never bypasses receiver admission");
});

test("closed class-union methods compare their admitted value arguments rather than the receiver annotation", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Left { value(this: void, input: number): number { return input + 1; } }
    export class Right { value(this: void, input: number): number { return input + 2; } }
    export function run(receiver: Left | Right): number { return receiver.value(4); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /\bvoid\s+@?this\b/u);
  assert.match(output, /value\([^)]*double input/u);
});

test("an object method stored in a native delegate field publishes only its sealed value parameters", () => {
  const compiled = compileCsharpSource({ sourceText: `
    class HandlerBox { run: (value: number) => number = value => value; }
    function make(): HandlerBox { return { run(this: void, value: number): number { return value + 1; } }; }
    export function run(): boolean { return make().run(6) === 7; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /\bvoid\s+@?this\b/u);
  assert.equal(output.includes("value + 1"), true, "the actual native delegate body is preserved");
});
