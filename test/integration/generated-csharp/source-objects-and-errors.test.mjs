import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { explicitErrorStackSource, invalidErrorStackSources } from "../../../../tsonic/test/fixtures/explicit-error-stacks.mjs";
import { sourceClassAnnotationSource, invalidSourceClassAnnotations } from "../../../../tsonic/test/fixtures/source-class-annotations.mjs";
import { boundMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/bound-memory-records.mjs";
import { numberArrayUnionFiles } from "../../../../tsonic/test/fixtures/number-array-unions.mjs";
import { frozenObjectSources } from "../../../../tsonic/test/fixtures/frozen-objects.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  test(`explicit Error stacks execute without implicit capture (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: explicitErrorStackSource }), `explicit-error-stack-${profile}`);
    for (const sourceText of invalidErrorStackSources) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.match(compiled.sourceDiagnosticsText, /error TS/u);
    }
  });
  test(`abstract declarations and readonly annotations preserve native dispatch (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: sourceClassAnnotationSource }), `class-annotations-${profile}`);
    for (const { source: sourceText, code } of invalidSourceClassAnnotations) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.ok(compiled.sourceDiagnosticsText.includes(code), compiled.sourceDiagnosticsText);
    }
  });
}

test("numeric array presence preserves initialized elements, boundary keys and evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
let order = "";
const values = new Array<number>(2);
values[1] = 0;
function index(): number { order += "i"; return 1; }
function array(): number[] { order += "a"; return values; }
export function run(): boolean {
  const present = index() in array();
  return present && order === "ia" && 0 in values && -0 in values && values[0] === 0 &&
    !(-1 in values) && !(0.5 in values) && !(2 in values) && !(Number.POSITIVE_INFINITY in values) && !(Number.NaN in values);
}` }), "numeric-array-presence");
});

for (const [name, source] of Object.entries(frozenObjectSources)) {
  test(`frozen reference objects preserve ${name}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `${source}\nexport function run(): boolean { main(); return true; }` }), `frozen-${name}`);
  });
}

for (const surface of [undefined, "js"]) {
  test(`structural generic templates preserve rest getter order (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: `
let order = "";
function copy(value: { readonly omitted: number; readonly zip: string; readonly country: string }): string {
  const { omitted, ...rest } = value;
  return rest.zip + rest.country;
}
export function run(): boolean {
  const value = {
    get omitted(): number { order += "o"; return 1; },
    get zip(): string { order += "z"; return "75001"; },
    get country(): string { order += "c"; return "FR"; },
  };
  const result = copy(value);
  return result === "75001FR" && order === "ozc";
}` }), `structural-rest-order-${surface ?? "native"}`);
  });
}

test("reference defaults evaluate in the callee only for omitted and undefined arguments", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
let calls = 0;
const token = {value: 4};
function make(): {value: number} { calls += 1; return token; }
class Holder { value: {value: number}; constructor(value = make()) { this.value = value; } }
export function run(): boolean {
  const first = new Holder();
  const second = new Holder(undefined);
  const other = {value: 8};
  const third = new Holder(other);
  return calls === 2 && first.value === token && second.value === token && third.value === other;
}` }), "reference-defaults");
});

test("generic literal arguments preserve exact carrier inference regardless of argument order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ sourceText: `
import { allocateptr, loadptr, storeptr } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
function first<T>(value: T, location: Pointer<T>): T { storeptr(location, value); return loadptr(location); }
function last<T>(location: Pointer<T>, value: T): T { return first(value, location); }
export function run(): boolean {
  const location = allocateptr<number>(1);
  const wide = allocateptr<uint32>(0);
  return first(9, location) === 9 && last(location, 12) === 12 && first(4294967295, wide) === 4294967295;
}` }), "generic-literal-inference");
});

test("writable methods select before arguments and retain previously selected functions", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
export class Counter { value(step: number): number { return step + 1; } }
function replace(counter: Counter): number { counter.value = (step: number): number => step + 10; return 2; }
export function run(): boolean {
  const counter = new Counter();
  const before = counter.value;
  const selected = counter.value(replace(counter));
  return selected === 3 && counter.value(2) === 12 && before(2) === 3;
}` });
  compiled.artifacts.set("generated/TsonicEntrypoint.cs", `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("method evaluation order");
var counter = new Tsonic.Generated.Counter();
var selected = counter.value;
if (!object.ReferenceEquals(selected, counter.value)) throw new System.Exception("method identity");
for (var warmup = 0; warmup < 10000; warmup++) System.GC.KeepAlive(counter.value);
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) System.GC.KeepAlive(counter.value);
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("method read allocated");
counter.value = step => step + 10;
if (selected(2) != 3 || counter.value(2) != 12) throw new System.Exception("method replacement");
`);
  executeCsharpConstruction(compiled, "writable-methods");
});

for (const surface of [undefined, "js"]) {
  test(`inline structural construction retains own keys (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: `
function keys(value: { count: number; label: string }): string {
  let result = "";
  for (const key in value) result += key + ",";
  return result;
}
export function run(): boolean {
  const count = 1;
  return keys({ label: "first", count }) === "label,count,";
}` }), `inline-enumeration-${surface ?? "native"}`);
  });
  test(`mapped readonly arguments preserve identity and independent copies (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Item = { count: number; label: string };
function read(value: Readonly<Item>): number { return value.count; }
function clone(value: Readonly<Item>): Item { return { ...value }; }
export function run(): boolean {
  const item: Item = { count: 1, label: "first" };
  const view: Readonly<Item> = item;
  const copy = clone(view);
  item.count = 7;
  copy.count = 9;
  return read(view) === 7 && copy.count === 9 && item.count === 7;
}` });
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /interface ObjectShape_\w+<out Property0, out Property1>/u);
    assert.match(generated, /interface ObjectShape_\w+<Property0, Property1> : ObjectShape_\w+<Property0, Property1>/u);
    executeCsharpConstruction(compiled, `mapped-readonly-${surface ?? "native"}`);
  });
}

test("constant initializer storage remains native without read-time numeric casts", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
const total = 1;
function selected(): number { const value = 2; return value; }
export function run(): boolean { return total === 1 && selected() === 2; }
` });
  executeCsharpConstruction(compiled, "constant-native-storage");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /int value = 2;/);
  assert.match(output, /static int total\b/);
  assert.doesNotMatch(output, /\(int\)(?:value|total)/);
});

test("JavaScript error subclasses preserve constructor, call and base identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
export function run(): boolean {
  const first = new TypeError("first");
  const second = RangeError("second");
  const third = new URIError("third");
  return first instanceof Error && first instanceof TypeError && !(first instanceof RangeError) &&
    second instanceof Error && second instanceof RangeError && third instanceof URIError && first.message === "first";
}` }), "error-subclasses");
});

test("a local same-spelled error constructor remains source-owned", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
class TypeError { value = 9; }
export function run(): boolean { const value = new TypeError(); return value.value === 9; }
` }), "shadowed-error-subclass");
});

for (const valueRepresentation of [false, true]) {
  for (const surface of [undefined, "js"]) {
    const label = `${valueRepresentation ? "value" : "reference"}-${surface ?? "native"}`;
    test(`bound records retain live field locations, ownership and errors in ${label}`, { timeout: 300_000 }, () => {
      const files = boundMemoryRecordProofFiles(valueRepresentation);
      executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
        sourceText: files["index.ts"],
        files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "index.ts")),
      }), `bound-records-${label}`);
    });
  }
}

test("typed and ordinary numeric array unions preserve reads, width and copy independence", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
    sourceText: `${numberArrayUnionFiles["index.ts"]}\nif (!run()) throw new Error("number array union contract");`,
    files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
  }), "number-array-unions");
});
