import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeCharacterInputsSource } from "../../../../tsonic/test/fixtures/native-character-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericNumberPredicatesSource } from "../../../../tsonic/test/fixtures/generic-number-predicates.mjs";

test("generic Number predicates retain exact native carriers and their numeric constraints", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: genericNumberPredicatesSource });
  executeCsharpConstruction(compiled, "generic-number-predicates");
  executeCsharpConstruction(compiled, "generic-number-predicate-allocation", false, false, [], `
using Index = Tsonic.Generated.Index;
var value = System.Numerics.BigInteger.Parse("9007199254740993");
for (var iteration = 0; iteration < 10000; iteration++)
    if (!Index.forward(value) || !Index.forward(uint.MaxValue)) throw new System.Exception("predicate");
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++)
    if (!Index.forward(value) || !Index.forward(uint.MaxValue)) throw new System.Exception("predicate");
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("predicate allocation");
`);
});

test("unconstrained Number predicate inputs cannot acquire an invented numeric constraint", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    "export function integer<Value>(value: Value): boolean { return Number.isInteger(value); }" });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED"), true);
  assert.equal(compiled.result.artifacts.length, 0);
});

test("void results retain unit calls, nullable conversion and equality effects", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
function value(): number { visits += 1; return visits; }
function unit(): void { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
function compare(value: number | undefined): boolean { return value === void unit(); }
export function run(): boolean {
  return String(void value()) === "null" && String(void unit()) === "null" &&
    optional(void value()) && optional(void unit()) && compare(undefined) && visits === 5;
}
` }), "void-source-values");
});

test("void awaited unit and value operands preserve completion order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
let visits = 0;
async function value(): Promise<number> { visits += 1; return visits; }
async function unit(): Promise<void> { visits += 1; }
function optional(value: number | undefined): boolean { return value === undefined; }
export async function run(): Promise<boolean> {
  return optional(void await value()) && optional(void (await unit())) && visits === 2;
}
` }), "void-awaited-values", true);
});

test("qualified source builtins retain static operations and local shadows", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
function local(globalThis: { String: { fromCharCode: (value: number) => number } }): number {
  return globalThis.String.fromCharCode(7);
}
export function run(): boolean {
  const codes = [65, 66];
  const frozen = globalThis.Object.freeze({});
  return globalThis.String.fromCharCode(...codes) === "AB" &&
    (globalThis).String.fromCharCode(65) === "A" &&
    (globalThis.String).fromCodePoint(128512) === "😀" &&
    globalThis["String"].fromCharCode(...codes) === "AB" &&
    globalThis.Math.max(...[3, 7]) === 7 && globalThis.Object.isFrozen(frozen) &&
    local({ String: { fromCharCode: value => value + 1 } }) === 8;
}
` }), "qualified-source-builtins");
});

test("numeric sequence arguments retain initialized values, widths and source evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
import type { uint8 } from "@tsonic/core/types.js";
function check(value: boolean): void { if (!value) throw new Error("sequence contract"); }
export function run(): boolean {
  const bytes: uint8[] = [65, 66];
  const empty: number[] = [];
  check(String.fromCharCode(...bytes, ...empty, ...[67, 68]) === "ABCD");
  check(String.fromCharCode(...empty) === "");
  check(String.fromCharCode(...[]) === "");
  let emptyReads = 0;
  const emptyTuple = (): [] => { emptyReads += 1; return []; };
  check(String.fromCharCode(...emptyTuple()) === "" && emptyReads === 1);
  const tuple: [uint8, number] = [65, 66];
  check(String.fromCharCode(...tuple) === "AB");
  let tupleReads = 0;
  const readTuple = (): [uint8, number] => { tupleReads += 1; return tuple; };
  check(String.fromCharCode(...readTuple(), ...[], 67) === "ABC" && tupleReads === 1);
  check(String.fromCodePoint(...[128512]) === "😀");
  check(Math.max(2, ...[3, 8], ...empty, 4) === 8);
  check(Math.min(...[3, 8], 2) === 2 && Math.hypot(...[3, 4]) === 5);
  const initialized = new Array<number>(2);
  initialized[0] = 65;
  check(String.fromCharCode(...initialized) === "A\\0" && Math.max(...initialized) === 65);
  const mutable: number[] = [66];
  let evaluations = 0;
  const next = (): number => { evaluations += 1; mutable[0] = 88; return 67; };
  check(String.fromCharCode(65, ...mutable, next(), ...mutable) === "ABCX");
  check(evaluations === 1 && mutable[0] === 88);
  let caught = 0;
  try { String.fromCodePoint(...[1.5], next()); } catch { caught += 1; }
  check(caught === 1 && evaluations === 2);
  const fail = (): number => { throw new Error("stop"); };
  try { String.fromCharCode(...bytes, fail(), next()); } catch { caught += 1; }
  check(caught === 2 && evaluations === 2);
  return true;
}
` }), "numeric-rest-sequences");
});

test("character constructors retain native arguments and evaluation order", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeCharacterInputsSource });
  executeCsharpConstruction(compiled, "native-character-inputs");
  const text = [...compiled.artifacts.values()].join("\n");
  assert.match(text, /fromCodePoint<uint>/u);
  assert.match(text, /fromCharCode<byte>/u);
  assert.doesNotMatch(text, /Convert\.ToDouble|\(double\)/u);
});

test("contextual callback returns convert broad values without erasing native integer results", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    export function run(): boolean {
      let calls = 0;
      const replaced = "a1b2".replace(/([a-z])(\\d)/g, (whole, letter, digit, offset, input) => {
        if (input !== "a1b2" || offset !== calls * 2) throw new Error("callback arguments");
        calls += 1;
        return digit + letter;
      });
      const wide: int64 = 9007199254740993n;
      const retained = [wide].map(value => value);
      return replaced === "1a2b" && calls === 2 && retained[0] === wide;
    }
  ` });
  executeCsharpConstruction(compiled, "contextual-callback-return-carriers");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /JSArray<long>/u);
  assert.doesNotMatch(generated, /Convert\.ToDouble|\(double\)wide/u);
});

test("contextual rest formals supply scalar named inputs without changing actual rest bindings", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    export function run(): boolean {
      const named: (prefix: string, ...values: int64[]) => int64 = (prefix, first, second) =>
        prefix === "wide" ? first + second : 0n;
      const rest: (prefix: string, ...values: int64[]) => int64 = (prefix, ...values) =>
        prefix === "wide" ? values[0] + values[1] : 0n;
      const tuple: (...values: [int32, string]) => string = (count, label) => count + label;
      const tupleRest: (...values: [int32, string]) => string = (...values) => values[0] + values[1];
      const wide: int64 = 9007199254740993n;
      return named("wide", wide, 2n) === wide + 2n && rest("wide", wide, 2n) === wide + 2n &&
        tuple(7, "x") === "7x" && tupleRest(7, "x") === "7x";
    }
  ` });
  executeCsharpConstruction(compiled, "contextual-rest-native-inputs");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /JSArray<long>/u);
  assert.doesNotMatch(generated, /Convert\.ToDouble|\(double\)wide/u);
});

test("String search preserves the native integer result and custom returns", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import { jsstr } from "@tsonic/js/lang.js";
    function pattern(value: string) { return value.search("ab"); }
    function regexp(value: string) { return value.search(/ab/); }
    function exact(value: string) { return jsstr(value).search(/ab/); }
    function protocol(value: string) { return /ab/[Symbol.search](value); }
    class Local { search(value: string): number { return value === "ab" ? 1.5 : 2.5; } }
    function local(value: Local) { return value.search("ab"); }
    export function run(): boolean {
      return pattern("zab") === 1 && pattern("zzz") === -1 &&
        regexp("zab") === 1 && regexp("zzz") === -1 &&
        exact("zab") === 1 && exact("zzz") === -1 &&
        protocol("zab") === 1 && protocol("zzz") === -1 && local(new Local()) === 1.5;
    }
  ` });
  executeCsharpConstruction(compiled, "native-string-search-results");
  const generated = [...compiled.artifacts.values()].join("\n");
  for (const name of ["pattern", "regexp", "exact", "protocol"]) {
    assert.match(generated, new RegExp(`static int ${name}\\(`, "u"));
  }
  assert.match(generated, /static double local\(/u);
});
