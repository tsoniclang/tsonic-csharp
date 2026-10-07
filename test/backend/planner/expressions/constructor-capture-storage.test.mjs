import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`prepared constructor callbacks retain one shared native activation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      let defaults = 0 as int32;
      let baseCalls = 0 as int32;
      function defaultCount(): int32 { return defaults; }
      class Base {
        callback: () => int32;
        observed: int32;
        constructor(callback: () => int32) {
          baseCalls++;
          this.callback = callback;
          this.observed = callback();
        }
      }
      class DefaultOnly extends Base {
        constructor(value: int32, adjust: () => int32 = (defaults++, () => ++value)) { super(adjust); }
      }
      class Shared extends Base {
        after: int32;
        read: () => int32;
        update: () => int32;
        constructor(value: int32, adjust: () => int32 = (defaults++, () => ++value)) {
          super(adjust);
          this.after = value;
          this.read = () => value + this.observed;
          this.update = () => ++value;
        }
      }
      class Destructured extends Base {
        after: int32;
        constructor({ value }: { value: int32 }) { super(() => ++value); this.after = value; }
      }
      export function run(): boolean {
        const only = new DefaultOnly(9 as int32);
        if (only.observed !== 10 || only.callback() !== 11 || defaultCount() !== 1) return false;
        const shared = new Shared(9 as int32);
        if (shared.observed !== 10 || shared.after !== 10 || shared.read() !== 20) return false;
        if (shared.update() !== 11 || shared.callback() !== 12 || shared.read() !== 22) return false;
        let suppliedValue = 30 as int32;
        const adjust = () => ++suppliedValue;
        const supplied = new Shared(9 as int32, adjust);
        if (defaultCount() !== 2 || supplied.callback !== adjust || supplied.after !== 9 || supplied.observed !== 31) return false;
        if (supplied.update() !== 10 || supplied.read() !== 41 || supplied.callback() !== 32 || supplied.read() !== 41) return false;
        const destructured = new Destructured({ value: 4 as int32 });
        return destructured.observed === 5 && destructured.after === 5 && destructured.callback() === 6 && baseCalls === 4;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `constructor-capture-storage-${surface ?? "native"}`);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal([...emitted.matchAll(/new ObjectShape_capture_[\da-f]+/gu)].length, 3,
      "one native environment per genuinely captured constructor activation");
    assert.doesNotMatch(emitted, /private (?:Shared|DefaultOnly|Destructured)\(\(int,/u,
      "the prepared packet carries shared storage, not a captured-parameter snapshot");
    assert.doesNotMatch(emitted, /Activator|System\.Reflection|DynamicInvoke|Task\.Run|ContinueWith/u);
  });
}

test("uncaptured constructor preparation remains a stack value packet without a capture allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    class Base { value: int32; constructor(value: int32) { this.value = value; } }
    class Derived extends Base {
      after: int32;
      constructor(value: int32 = 7 as int32) { super(value); this.after = value; }
    }
    export function run(): boolean { const value = new Derived(); return value.value === 7 && value.after === 7; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "constructor-capture-free");
  const emitted = [...compiled.artifacts.values()].join("\n");
  assert.match(emitted, /private Derived\(\(int, int\)/u);
  assert.match(emitted, /return \(value,/u);
  assert.doesNotMatch(emitted, /ObjectShape_capture_|__tsonic_captures|new .*Func|Activator|System\.Reflection/u);
});

test("captured parameter defaults preserve escaping storage and exact errors before any base effect", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let baseCalls = 0 as int32;
    let saved: () => int32 = () => 0 as int32;
    const failure = new Error("prepared capture");
    function retain(callback: () => int32): () => int32 { saved = callback; return callback; }
    function fail(): int32 { throw failure; }
    class Base { constructor(callback: () => int32) { baseCalls++; callback(); } }
    class Derived extends Base {
      constructor(value: int32, adjust: () => int32 = retain(() => ++value), check: int32 = fail()) {
        super(adjust);
        value += check;
      }
    }
    export function run(): boolean {
      try { new Derived(9 as int32); return false; }
      catch (caught) { return caught === failure && baseCalls === 0 && saved() === 10 && saved() === 11; }
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "constructor-capture-default-failure");
  const emitted = [...compiled.artifacts.values()].join("\n");
  assert.equal([...emitted.matchAll(/new ObjectShape_capture_[\da-f]+/gu)].length, 1,
    "escaping failed construction retains its one native activation");
});
