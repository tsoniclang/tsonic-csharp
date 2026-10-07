import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function generatedText(compiled) {
  return [...compiled.artifacts.values()].join("\n");
}

test("inferred broad freeze results retain the native object carrier instead of an empty shape", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type Token = object;
    function retain(value: Token): Token { return value; }
    export function run(): boolean {
      const first: Token = {};
      const alias = retain(first);
      const frozen = Object.freeze(first);
      const retained = retain(frozen);
      const direct = {};
      const directFrozen = Object.freeze(direct);
      return frozen === alias && retained === first && directFrozen === direct &&
        Object.isFrozen(frozen) && Object.isFrozen(retained) && Object.isFrozen(directFrozen);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /object frozen =/);
  assert.match(text, /EmptyObject\.Freeze<object>/);
  assert.match(text, /EmptyObject\.Freeze<Tsonic\.CSharp\.Runtime\.EmptyObject>/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-inferred-object-carrier");
});

test("empty freeze uses one native state across broad aliases, parameters and returns", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    function retain(value: object): object { return value; }
    function frozen(value: object): object { return Object.freeze(value); }
    export function run(): boolean {
      const first: object = {};
      const alias = retain(first);
      const direct = {};
      const directAlias: object = direct;
      const before = Object.isFrozen(alias) || Object.isFrozen(directAlias);
      const frozenFirst = frozen(first);
      const frozenDirect = Object.freeze(direct);
      const second: object = Object.freeze({});
      const wide: int64 = 9007199254740993n;
      return !before && frozenFirst === alias && frozenDirect === directAlias &&
        Object.isFrozen(alias) && Object.isFrozen(directAlias) && Object.isFrozen(direct) &&
        Object.isFrozen(second) && second !== first && wide === 9007199254740993n;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /EmptyObject\.Freeze<object>/);
  assert.match(text, /EmptyObject\.IsFrozen<object>/);
  assert.match(text, /object retain\(object value\)/);
  assert.match(text, /9007199254740993L/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\.|GetProperty|Activator/);
  executeCsharpConstruction(compiled, "frozen-empty-broad-aliases");
});

test("empty freeze retains exact container origins without altering native object elements", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function retain(value: object): object { return value; }
    export function run(): boolean {
      const first: object = {};
      const slots: object[] = [first];
      const pair: [object, object] = [first, {}];
      const holder: { value: object } = { value: first };
      const alias = retain(slots[0]);
      if (Object.isFrozen(alias)) return false;
      Object.freeze(holder.value);
      return Object.isFrozen(pair[0]) && Object.isFrozen(slots[0]) &&
        Object.isFrozen(alias) && !Object.isFrozen(pair[1]);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-container-aliases");
});

test("empty freeze closes private callbacks and receivers without treating type exports as value escapes", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export interface Holder { value: object; }
    class LocalHolder { value: object = {}; }
    const record: Holder = { value: {} };
    const instance = new LocalHolder();
    const retain = (value: object): object => value;
    export function run(): boolean {
      const recordAlias = retain(record.value);
      const instanceAlias = retain(instance.value);
      if (Object.isFrozen(recordAlias) || Object.isFrozen(instanceAlias)) return false;
      Object.freeze(recordAlias);
      Object.freeze(instanceAlias);
      return Object.isFrozen(record.value) && Object.isFrozen(instance.value) &&
        recordAlias === record.value && instanceAlias === instance.value;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-closed-local-receivers");
});

test("exported readonly token bindings retain exact empty identity without an external replacement domain", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export const token: object = {};
    export function run(): boolean {
      if (Object.isFrozen(token)) return false;
      return Object.freeze(token) === token && Object.isFrozen(token);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /public static object token\s*\{\s*get;\s*private set;\s*\}/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-exported-readonly-token");
});

test("selected aliases of native freeze operations preserve exact result identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    const freeze = Object.freeze;
    const frozen = Object.isFrozen;
    export function run(): boolean {
      const token: object = {};
      const retained = freeze(token);
      return retained === token && frozen(retained) && frozen(token);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-selected-operation-aliases");
});

test("externally visible readonly empty members retain their one fixed native value domain", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export class Holder { readonly value: object = {}; }
    export const record: { readonly value: object } = { value: {} };
    export function run(): boolean {
      const holder = new Holder();
      const alias = holder.value;
      if (Object.isFrozen(alias) || Object.isFrozen(record.value)) return false;
      Object.freeze(holder.value);
      Object.freeze(record.value);
      return Object.isFrozen(alias) && Object.isFrozen(record.value) && alias === holder.value;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-exported-readonly-members");
});

test("empty freeze preserves checked absent-path refinement and evaluates operands once", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function retain(value: object | null): object | null { return value; }
    export function run(): boolean {
      let calls = 0;
      const first: object = {};
      function selected(): object { calls += 1; return first; }
      const absent = retain(null);
      const present = retain(first);
      if (absent !== null || present === null) return false;
      if (Object.freeze(selected()) !== present || calls !== 1) return false;
      return Object.isFrozen(present) && calls === 1;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-refined-absence");
});

test("repeated empty freeze matches handwritten native allocation with no additional state", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const value: object = {};
      let frozen = false;
      for (let iteration = 0; iteration < 20000; iteration += 1) {
        Object.freeze(value);
        frozen = Object.isFrozen(value);
      }
      return frozen;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|TsValue|dynamic\b/);
  const output = executeCsharpConstruction(compiled, "frozen-empty-native-allocation", false, false, [], `
    static bool Handwritten() {
      var value = new Tsonic.CSharp.Runtime.EmptyObject();
      var frozen = false;
      for (var iteration = 0; iteration < 20000; iteration += 1) {
        Tsonic.CSharp.Runtime.EmptyObject.Freeze(value);
        frozen = Tsonic.CSharp.Runtime.EmptyObject.IsFrozen(value);
      }
      return frozen;
    }
    Tsonic.Generated.Index.run();
    Handwritten();
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    var generated = Tsonic.Generated.Index.run();
    var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    var native = Handwritten();
    var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (!generated || !native || generatedBytes != nativeBytes)
      throw new System.Exception($"native allocation {generatedBytes}/{nativeBytes}");
    System.Console.WriteLine($"native allocation {generatedBytes}/{nativeBytes}");
  `);
  assert.match(output, /native allocation (\d+)\/\1/);
});

const openSources = [
  ["private erased record", `function freeze(value: object): object { return Object.freeze(value); } export function example(): object { return freeze({ count: 1 }); }`],
  ["exported opaque object", `export function freeze(value: object): object { return Object.freeze(value); }`],
  ["exported opaque object with local empty call", `export function freeze(value: object): object { return Object.freeze(value); } export function run(): object { return freeze({}); }`],
  ["exported alias", `type Open = object; export function freeze(value: Open): Open { const alias = value; return Object.freeze(alias); }`],
  ["nested opaque member", `export function frozen(value: { inner: object }): boolean { return Object.isFrozen(value.inner); }`],
  ["mixed allocation origins", `function freeze(value: object): object { return Object.freeze(value); } export function run(flag: boolean): object { return freeze(flag ? {} : { count: 1 }); }`],
  ["unknown array element", `export function run(values: object[]): boolean { return Object.isFrozen(values[0]); }`],
  ["mixed array origins", `export function run(): boolean { const values: object[] = [{}, { count: 1 }]; return Object.isFrozen(values[0]); }`],
  ["mutable record origin", `export function run(flag: boolean): boolean { let value: object = {}; if (flag) value = { count: 1 }; return Object.isFrozen(value); }`],
  ["exported generic unknown with local empty call", `export function freeze<T extends object>(value: T): T { return Object.freeze(value); } export function run(): object { return freeze({}); }`],
  ["escaping private callable", `function freeze(value: object): object { return Object.freeze(value); } export function retained(): (value: object) => object { freeze({}); return freeze; }`],
  ["exported mutable token", `export let value: object = {}; export function frozen(): boolean { return Object.isFrozen(value); }`],
  ["exported mutable class field", `export class Holder { value: object = {}; frozen(): boolean { return Object.isFrozen(this.value); } }`],
  ["exported mutable record field", `export const holder: { value: object } = { value: {} }; export function frozen(): boolean { return Object.isFrozen(holder.value); }`],
  ["exported mutable record alias", `const holder: { value: object } = { value: {} }; export const retained = holder; export function frozen(): boolean { return Object.isFrozen(holder.value); }`],
  ["readonly publication cannot erase a mutable exported alias", `const holder: { value: object } = { value: {} }; export const readonlyView: { readonly value: object } = holder; export const mutableView = holder; export function frozen(): boolean { return Object.isFrozen(readonlyView.value); }`],
  ["readonly publication cannot erase observed private member replacement", `const holder: { value: object } = { value: {} }; export const readonlyView: { readonly value: object } = holder; export function frozen(): boolean { holder.value = { count: 1 }; return Object.isFrozen(readonlyView.value); }`],
  ["returned mutable record storage", `const holder: { value: object } = { value: {} }; export function retained(): { value: object } { return holder; } export function frozen(): boolean { return Object.isFrozen(holder.value); }`],
  ["private class instance returned through exported function", `class Holder { value: object = {}; } const holder = new Holder(); export function retained(): Holder { return holder; } export function frozen(): boolean { return Object.isFrozen(holder.value); }`],
  ["exported readonly member with writable descendants", `export const holder: { readonly values: object[] } = { values: [{}] }; export function frozen(): boolean { return Object.isFrozen(holder.values[0]); }`],
  ["returned readonly member with writable descendants", `const holder: { readonly nested: { value: object } } = { nested: { value: {} } }; export function retained(): { readonly nested: { value: object } } { return holder; } export function frozen(): boolean { return Object.isFrozen(holder.nested.value); }`],
  ["exported mutable tuple element", `export const pair: [object, object] = [{}, {}]; export function frozen(): boolean { return Object.isFrozen(pair[0]); }`],
  ["exported mutable array element", `export const values: object[] = [{}]; export function frozen(): boolean { return Object.isFrozen(values[0]); }`],
  ["opaque checked callback can mutate an exposed record", `export function frozen(mutate: (holder: { value: object }) => void): boolean { const holder: { value: object } = { value: {} }; mutate(holder); return Object.isFrozen(holder.value); }`],
  ["opaque checked callback can mutate writable readonly-member descendants", `export function frozen(mutate: (holder: { readonly values: object[] }) => void): boolean { const holder: { readonly values: object[] } = { values: [{}] }; mutate(holder); return Object.isFrozen(holder.values[0]); }`],
  ["unrelated freeze spelling", `const unrelated = { freeze(value: object): object { return { count: 1 }; } }; export function frozen(): boolean { const first: object = {}; return Object.isFrozen(unrelated.freeze(first)); }`],
  ["generic replacement result is not an input identity promise", `function replace<T extends object>(value: T, replacement: T): T { return replacement; } export function frozen(): boolean { const first: object = {}; const second: object = { count: 1 }; return Object.isFrozen(replace(first, second)); }`],
];

for (const [name, sourceText] of openSources) {
  test(`open empty freeze proof rejects ${name} before any publication`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "source remains valid without annotations");
    assert.equal(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0, true,
      "missing exact native origin evidence must fail closed");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TS9101001" &&
      /^The exact selected JS source-profile call 'js\.ObjectConstructor\.(?:freeze|isFrozen)\.member' has no closed C# target relation\.$/.test(diagnostic.message)), true,
      "the exact freeze operation owner rejects the unproven domain");
    assert.equal(compiled.artifacts.size, 0, "rejected source publishes no target artifacts");
  });
}

test("unrefined absence cannot bypass the source object's non-absent contract", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `export function run(value: object | null): object | null { return Object.freeze(value); }` });
  assert.match(compiled.sourceDiagnosticsText, /TS2345/);
  assert.match(compiled.sourceDiagnosticsText, /null.*not assignable/);
  assert.equal(compiled.artifacts.size, 0, "invalid absence publishes no target artifacts");
});
