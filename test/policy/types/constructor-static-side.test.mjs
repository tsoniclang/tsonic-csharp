import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

// K-2448 #3: a Source shape with construct signatures is represented as a class's static receiver only when its whole
// member/index inventory IS that class's static side. Any other construct-plus-member/index contract is refused, never
// reduced to its constructor result.
const accepted = [
  ["static member of a class with an implicit constructor", `
    export class Box { value: number = 4; static shared: number = 3; }
    export function run(): number { return new Box().value + Box.shared; }`],
  ["static method and static field of a class with a declared constructor", `
    export class Counter { constructor(public start: number) {} static zero(): Counter { return new Counter(0); } static step: number = 1; }
    export function run(): number { return Counter.zero().start + Counter.step; }`],
  ["overloaded constructors", `
    export class Two { value: number; constructor(value: number); constructor(value: number, scale: number); constructor(value: number, scale?: number) { this.value = value; void scale; } static unit: number = 1; }
    export function run(): number { return new Two(2).value + new Two(3, 2).value + Two.unit; }`],
];

const refused = [
  ["a construct signature plus an extra required field read through the value", `
    export class Body { value: number = 1; static shared: number = 2; }
    declare const make: { new (): Body; readonly tag: string };
    export function read(): string { return make.tag; }`],
  ["a construct signature plus a same-named non-static field read through the value", `
    export class Body { value: number = 1; static shared: number = 2; }
    declare const make: { new (): Body; readonly shared: number };
    export function read(): number { return make.shared; }`],
  ["a construct signature plus an index signature read through the value", `
    export class Body { value: number = 1; }
    declare const make: { new (): Body; readonly [key: string]: number };
    export function read(): number { return make["count"]; }`],
];

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of accepted) {
    test(`${surface}: ${name} keeps the class static receiver`, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.equal(compiled.sourceDiagnosticsText, "", name);
      assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`), [], name);
    });
  }
  for (const [name, sourceText] of refused) {
    test(`${surface}: ${name} is not reduced to its constructor result`, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.equal(compiled.sourceDiagnosticsText, "", name);
      assert.equal(compiled.targetDiagnostics.length > 0, true,
        `${name}: a construct contract with other members has no constructor-only representation`);
      const output = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(output, /\bBody\.(tag|shared|count)\b|Body\[/u, `${name}: no emission reads the contract member from Body's static side`);
    });
  }
}
