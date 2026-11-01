import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

for (const surface of ["native", "js"]) {
  test(`an inferred constructor callback receives the selected native uint64 resolver rather than erased bigint on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
export async function run(): Promise<boolean> {
  const exact: uint64 = 9007199254740993n;
  const immediate = new Promise<uint64>(resolve => { resolve(exact); });
  const adopted = new Promise<uint64>(resolve => { resolve(immediate); });
  const throwing = new Promise<uint64>(resolve => { resolve(exact); throw new Error("after completion"); });
  return await immediate === exact && await adopted === exact && await throwing === exact;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the selected native constructor publishes its checked callback contracts");
    const ast = program.source.ast;
    let checked = 0;
    const visit = node => {
      if (ast.is.IsArrowFunction(node)) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        assert.equal(contract?.kind === "source", true, "the callback retains its source declaration owner");
        const resolver = contract.nativeParameters[0]?.targetParameter.type;
        const payload = getCsharpDelegateSignature(resolver)?.parameters[0];
        const arms = getCsharpRuntimeUnionArms(payload);
        assert.equal(arms?.some(arm => arm.kind === "source-primitive" && arm.name === "uint64"), true,
          "the inferred resolver receives the selected exact uint64 union arm");
        assert.equal(arms?.some(arm => arm.kind === "target-named" && arm.id === "System.Numerics.BigInteger"), false,
          "source bigint erasure does not replace authored native constructor metadata");
        checked += 1;
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(checked, 3, "direct completion, Task adoption and throwing completion use the same physical resolver contract");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/TaskCompletion<ulong>\.Create/u.test(generated), true, "native completion uses the exact selected scalar");
    assert.equal(/Task<[^>]*BigInteger/u.test(generated), false, "Task completion does not round-trip through arbitrary precision");
    executeCsharpConstruction(compiled, `native-constructor-context-${surface}`, true, false, [],
      'if (!await Tsonic.Generated.Index.run()) throw new System.Exception("native uint64 callback context");');
  });
}

for (const surface of ["native", "js"]) {
  test(`base callable arguments use actual native statement preparation on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Base {
  result: number;
  constructor(read: (value: number) => number) { this.result = read(2); }
}
class Plain extends Base {
  constructor() { super((value: number): number => value + 3); }
}
class Recursive extends Base {
  constructor() {
    super(function recurse(value: number): number { return value === 0 ? 5 : recurse(value - 1); });
  }
}
export function run(): boolean { return new Plain().result === 5 && new Recursive().result === 5; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const arguments_ = [];
    const visit = node => {
      if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) arguments_.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(arguments_.length, 2, "the two original base-call arguments are the complete callable domain");
    for (const argument of arguments_) {
      const plain = ast.is.IsArrowFunction(argument);
      const creation = program.records.callableCreation.get(argument);
      const emitted = program.records.lambdaBody.get(argument);
      assert.equal(creation?.kind, "selected", "each argument has its exact native creation");
      assert.equal(emitted?.preparation, plain ? "expression" : "statements",
        "real local-function preparation, not allocation placement, controls sequencing");
      assert.equal(Object.isFrozen(emitted), true, "the same completed preparation record is immutable");
      assert.equal(program.records.constructorArgument.get(argument)?.kind, plain ? "direct" : "helper",
        "base emission consumes the canonical preparation requirement");
      if (plain) assert.equal(creation.allocation.kind, "fresh", "a fresh delegate still needs no creation statements");
    }
    executeCsharpConstruction(compiled, `callable-preparation-${surface}`);
  });

  test(`generator function creation retains its real statement preparation on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int } from "@tsonic/csharp/types.js";
export const expression = function* (): Generator<int, string, int> {
  const next: int = yield 2;
  yield next;
  return "expression";
};
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const expressions = [];
    const visit = node => {
      if (ast.is.IsFunctionExpression(node)) expressions.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(expressions.length, 1, "one original generator expression");
    const declaration = expressions[0];
    assert.equal(program.records.callableDeclaration.get(declaration)?.generator, true,
      "the completed declaration, not a spelling heuristic, owns the native generator");
    assert.equal(program.records.lambdaBody.get(declaration)?.preparation, "statements");
    assert.equal(Object.isFrozen(program.records.lambdaBody.get(declaration)), true);
  });
}

for (const surface of ["native", "js"]) {
  test(`statements before super retain their checked source and precise native constructor refusal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Base { constructor(read: () => number) { read(); } }
export class Derived extends Base {
  constructor(value: number) { const read = () => value; super(read); }
}
` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original pre-super closure is valid checked source");
    assert.deepEqual(compiled.result.diagnostics.map(({ code, message }) => ({ code, message })), [{
      code: "CSHARP_UNSUPPORTED_AST",
      message: "A native C# derived constructor requires super(...) as its first statement; statements before base initialization are not supported.",
    }]);
    const issue = compiled.result.diagnostics[0];
    const ast = compiled.source.ast;
    assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression");
    const sourceFile = ast.getSourceFile(issue.sourceNode);
    assert.equal(compiled.source.sourceFiles.includes(sourceFile), true, "the real original base call owns the refusal");
    assert.equal(Buffer.from(ast.getSourceText(sourceFile))
      .subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode)).toString("utf8").trim(), "super(read)");
    assert.equal(compiled.result.program, undefined, "no incomplete native program is published");
    assert.equal(compiled.result.artifacts.length, 0);
  });

  test(`ordinary native lambda omitted slots preserve outer bindings and exact native argument shapes on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
function invoke(callback: (value: number, index: number) => number): number { return callback(7, 3); }
function invokeThree(callback: (value: number, first: number, second: number) => number): number { return callback(7, 3, 4); }
export function run(): boolean {
  const unused = 11;
  const _ = 5;
  return invoke((value: number) => value + unused) === 18 &&
    invoke((value: number) => value + 1) === 8 &&
    invokeThree((value: number) => value + _) === 12;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /\(double value, double unused1\) =>/u,
      "one omitted native slot has a plain collision-free name, never a shadowing underscore binding");
    assert.match(generated, /\(double value, double _, double _\) =>/u,
      "two actually omitted native slots remain native discards without binding the outer underscore");
    executeCsharpConstruction(compiled, `native-lambda-omitted-scope-${surface}`);
  });
}
