import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

const examples = [
  ["implicit and inherited construction with callable fields", `
    class Base { constructor(readonly value: number) {} }
    class Derived extends Base {}
    class Owner { readonly read = (value: number): number => value + 1; }
    export function run(): number { return new Owner().read(new Derived(3).value); }
  `],
  ["typed parameters, properties and callable getters", `
    interface Reader { read: (value: number) => number; }
    class Owner { get read(): (value: number) => number { return value => value + 1; } }
    function apply(callback: (value: number) => number, value: number): number { return callback(value); }
    export function run(reader: Reader): number { return apply(new Owner().read, reader.read(2)); }
  `],
  ["original tuple-rest and pseudo-this parameters", `
    function sum(this: void, thisValue: number, ...values: [number, number]): number {
      return thisValue + values[0] + values[1];
    }
    export function run(): number { return sum(1, 2, 3); }
  `],
];

for (const surface of ["native", "js"]) for (const [name, sourceText] of examples) {
  test(`checked callable values retain ${name} in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.artifacts.size > 0, true, "the complete checked source reaches target emission");
    assert.equal([...compiled.artifacts.values()].some(text => /static double run\(/u.test(text)), true,
      "the exported ordinary native function is retained");
  });
}
