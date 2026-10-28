import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`class factory captures native storage before a contextual union use on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Input = number | string;
function observe(value: Input): number { return typeof value === "number" ? value : 0; }
export function run(): number {
  const value: number = 7;
  class Holder { read(): number { return observe(value); } }
  return new Holder().read();
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const factories = program.classFactories;
    assert.equal(factories.length, 1, "the actual local class has one native factory");
    const slots = program.records.classCaptures.get(factories[0].declaration);
    assert.equal(slots.length, 1, "the factory captures its original value once");
    assert.equal(slots[0].kind, "binding", "a captured binding is not another execution of its contextual source use");
    assert.equal(slots[0].carrier.kind === "source-primitive" && slots[0].carrier.name === "float64", true,
      "the environment retains the exact physical source storage instead of its later union injection");
    executeCsharpConstruction(compiled, `class-capture-native-storage-${surface}`, false, false, [],
      'if (Tsonic.Generated.Index.run() != 7D) throw new System.Exception("class capture storage");');
  });
}
