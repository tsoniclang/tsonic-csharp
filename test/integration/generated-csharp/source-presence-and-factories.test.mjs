import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { nativeNumericArraysSource } from "../../../../tsonic/test/fixtures/native-numeric-arrays.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { selectedConstructorFiles } from "../../../../tsonic/test/fixtures/selected-constructors.mjs";
import { nativeSurfaceResultsSource, nativeNodeResultsSource } from "../../../../tsonic/test/fixtures/native-surface-results.mjs";
import { nativeOptionRuntimeSource } from "../../../../tsonic/test/fixtures/native-process-options.mjs";
import { nativeAbsenceSource, nativeAbsenceJsSource, nativeAbsenceArraySource } from "../../../../tsonic/test/fixtures/native-absence.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("generic absence arrays retain native storage and aliases", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: nativeAbsenceArraySource }), "native-absence-js-arrays");
});

test("JS surface absence keeps membership and native values", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: nativeAbsenceJsSource }), "native-absence-js-collections");
});

for (const surface of [undefined, "js"]) {
  test(`one native absence preserves values, aliases and evaluation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceSource });
    executeCsharpConstruction(compiled, `native-absence-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /Runtime\.(?:Null|Undefined|Optional)</u);
    assert.match(output, /long\?/u);
  });
}

test("native option fields check dynamic values before use", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeOptionRuntimeSource });
  executeCsharpConstruction(compiled, "native-option-fields", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
});

test("native JS result carriers preserve widths, aliases and API behavior", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeSurfaceResultsSource });
  executeCsharpConstruction(compiled, "native-surface-results");
  const text = [...compiled.artifacts.values()].join("\n");
  assert.match(text, /uint word\b/u);
  assert.match(text, /float single\b/u);
  assert.match(text, /uint first\b/u);
  assert.match(text, /int timer\b/u);
  assert.match(text, /int interval\b/u);
});

test("native Node result carriers reach locals and comparisons unchanged", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeNodeResultsSource });
  executeCsharpConstruction(compiled, "native-node-results", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
  const text = [...compiled.artifacts.values()].join("\n");
  assert.match(text, /long size\b/u);
  assert.match(text, /public static long nativeFileSize\(string path\)/u);
  assert.match(text, /public static long forwardedFileSize\(string path\)/u);
  assert.match(text, /uint word\b/u);
  assert.doesNotMatch(text, /Convert\.ToDouble|\(double\)stats\.size/u);
});

test("equal constructor carriers retain the exact selected source signatures", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: selectedConstructorFiles,
    sourceText: selectedConstructorFiles["index.ts"] }), "selected-constructors");
});

test("local class factories preserve mutable captures and per-evaluation constructor identity", { timeout: 300_000 }, () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    function make(initial: int32) {
      let current = initial;
      return class Item {
        value = current;
        increment(): int32 { current += 1; return current; }
        read(): int32 { return current; }
      };
    }
    export function run(): boolean {
      const First = make(3 as int32);
      const Alias = First;
      const Second = make(8 as int32);
      const first = new First();
      const sibling = new Alias();
      const second = new Second();
      const values = first.value === 3 && second.value === 8 && first.increment() === 4 &&
        sibling.read() === 4 && second.read() === 8;
      const firstIdentity = first instanceof First && first instanceof Alias && !(first instanceof Second);
      const secondIdentity = second instanceof Second && !(second instanceof First);
      return values && firstIdentity && secondIdentity;
    }
  `;
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  executeCsharpConstruction(compiled, "class-factory-identity");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /ReferenceEquals/u);
  assert.doesNotMatch(generated, /Activator|System\.Reflection|DynamicInvoke/u);
});

test("numeric array construction and copy retain native element bits", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeNumericArraysSource });
  executeCsharpConstruction(compiled, "native-numeric-arrays");
  const text = [...compiled.artifacts.values()].join("\n");
  assert.match(text, /Uint8Array\.From/u);
  assert.doesNotMatch(text, /Convert\.ToDouble|\.Select\(|IEnumerable<double>/u);
});

for (const surface of [undefined, "js"]) {
  test(`local class factories separate captured and construction generics (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: `
      import type { int32, int64 } from "@tsonic/core/types.js";
      function make<Outer extends number | bigint>(outer: Outer) {
        return class Box<Inner> {
          outer: Outer = outer;
          inner: Inner;
          constructor(inner: Inner) { this.inner = inner; }
          read(): Outer { return outer; }
          echo<Value>(value: Value): Value { return value; }
        };
      }
      function captured<Value>(value: Value) {
        return class Item { readonly value: Value = value; read(): Value { return value; } };
      }
      export function run(): boolean {
        const Box = make<int64>(9007199254740993n);
        const Alias = Box;
        const first = new Box<int32>(7);
        const second = new Alias<string>("stored");
        const Other = make<int64>(9007199254740993n);
        const Item = captured<int32>(11);
        const item = new Item();
        const values = first.inner === 7 && second.inner === "stored" && first.outer === 9007199254740993n &&
          first.read() === 9007199254740993n && first.echo<int32>(9) === 9 && item.value === 11 && item.read() === 11;
        const identity = first instanceof Box && second instanceof Alias && !(first instanceof Other);
        return values && identity;
      }
    ` });
    executeCsharpConstruction(compiled, `class-factory-generics-${surface ?? "native"}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /Create<Inner>\(Inner inner\)/u);
    assert.doesNotMatch(generated, /Activator|System\.Reflection|DynamicInvoke|Convert\.ToDouble/u);
  });
}

test("local class factories retain overloads, rest arrays and abstract implementations", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    abstract class Base { abstract read(): int32; }
    function overloaded() {
      return class Box extends Base {
        value: int32;
        constructor(value: int32);
        constructor(value: string);
        constructor(value: int32 | string) { super(); this.value = typeof value === "string" ? 7 : value; }
        read(): int32 { return this.value; }
      };
    }
    function rest() {
      return class Items { values: int32[]; constructor(...values: int32[]) { this.values = values; } };
    }
    export function run(): boolean {
      const Box = overloaded();
      const Items = rest();
      const values = new Items(3, 5);
      const base: Base = new Box("seven");
      return base.read() === 7 && new Box(9).read() === 9 && values.values[0] === 3 && values.values[1] === 5;
    }
  ` }), "class-factory-constructor-forms");
});

test("local class constructor defaults execute once per omitted construction", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let effects: int32 = 0;
    function next(): string { effects += 1; return effects === 1 ? "first" : "second"; }
    function effectCount(): int32 { return effects; }
    function make() {
      return class Value {
        value: string;
        constructor(value: string = next()) { this.value = value; }
      };
    }
    export function run(): boolean {
      const Value = make();
      if (effectCount() !== 0) return false;
      const first = new Value();
      const explicit = new Value("explicit");
      const second = new Value();
      return first.value === "first" && explicit.value === "explicit" && second.value === "second" && effectCount() === 2;
    }
  ` }), "class-factory-defaults");
});

test("conditional inference never guesses a lost native numeric annotation", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    declare const stored: unique symbol;
    interface Stored<Value> { readonly [stored]: Value; }
    type Storage<Value> = Value extends Stored<infer Inner> ? Inner : Value;
    class Key { declare readonly [stored]: int32; }
    export function roundtrip(value: Storage<Key>): Storage<Key> { return value; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.ok(compiled.targetDiagnostics.length > 0);
  assert.equal(compiled.artifacts.size, 0);
});
