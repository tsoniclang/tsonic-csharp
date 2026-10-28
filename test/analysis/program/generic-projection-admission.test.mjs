import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`generic member admission consumes the completed optional-storage projection on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
class Box<Value> {
  values: (Value | undefined)[];
  constructor(values: (Value | undefined)[]) { this.values = values; }
  put(value: Value): void { this.values[0] = value; }
  get(): Value | undefined { return this.values[0]; }
}
export function run(): boolean {
  const wide: int64 = 9007199254740993n;
  const values: (int64 | undefined)[] = [0n];
  const box = new Box<int64>(values);
  box.put(wide);
  const strings: (string | undefined)[] = [undefined];
  const text = new Box<string>(strings);
  text.put("stored");
  return box.values === values && box.get() === wide && values[0] === wide &&
    text.values === strings && text.get() === "stored" && strings[0] === "stored";
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    let owner;
    const visit = node => {
      if (ast.is.IsClassDeclaration(node) && ast.text(ast.name(node)) === "Box") owner = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(owner !== undefined, true, "the checked generic owner is retained");
    const projections = program.records.genericProjection.get(owner);
    for (const part of ["storage", "operations"]) assert.equal(projections.some(parameter =>
      parameter.csharpProjection?.kind === "optional" && parameter.csharpProjection.part === part), true,
    `the original class owns its complete native optional ${part} evidence before admission`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Runtime\.Optional<|\.FromNullable|\.ToNullable|\.ToArray\(\)|\.Select\(|DynamicInvoke/u.test(output), false,
      "fixed-point admission adds no optional wrapper, array copy, conversion or dynamic invocation");
    executeCsharpConstruction(compiled, `generic-projection-admission-${surface}`);
  });

  test(`completed representation analysis retains the exact ambient-source refusal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
declare const missing: number;
export function run(): number { return missing; }
` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the ambient declaration is checked source");
    assert.equal(compiled.targetDiagnostics.length === 1 &&
      compiled.targetDiagnostics[0].code === "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING" &&
      compiled.targetDiagnostics[0].message === "A runtime read of an authored ambient variable requires an exact native implementation.", true,
    "a genuine refusal remains exact and precedes any missing native-use invariant");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a failed source admission publishes neither a program nor generated artifacts");
  });
}
