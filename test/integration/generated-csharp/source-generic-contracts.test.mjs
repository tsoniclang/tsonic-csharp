import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { optionalIndexedArgumentsSource } from "../../../../tsonic/test/fixtures/optional-indexed-arguments.mjs";
import { unionCallContractsFiles, incompatibleUnionCalls } from "../../../../tsonic/test/fixtures/union-call-contracts.mjs";
import { classStructuralConversionFiles, invalidClassStructuralConversions } from "../../../../tsonic/test/fixtures/class-structural-conversions.mjs";
import { genericObjectMethodFiles, genericObjectCaptureSource, genericObjectMethodValueSource, invalidGenericObjectMethods } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { nestedArrayRestSource } from "../../../../tsonic/test/fixtures/nested-array-rest.mjs";
import { nestedStructuralStorageFiles, invalidNestedStructuralStorageFiles } from "../../../../tsonic/test/fixtures/nested-structural-storage.mjs";
import { bigintSwitchSource } from "../../../../tsonic/test/fixtures/bigint-switch.mjs";
import { classFactoryEffectsFiles } from "../../../../tsonic/test/fixtures/class-factory-effects.mjs";
import { tupleSatisfiesSource, invalidTupleSatisfiesSources } from "../../../../tsonic/test/fixtures/tuple-satisfies.mjs";
import { initializedModuleStateFiles } from "../../../../tsonic/test/fixtures/initialized-module-state.mjs";
import { nativeIntegerComplementSource } from "../../../../tsonic/test/fixtures/native-integer-complement.mjs";
import { nullishNeverSource } from "../../../../tsonic/test/fixtures/nullish-never.mjs";
import { pointerOwnerNarrowingSource } from "../../../../tsonic/test/fixtures/pointer-owner-narrowing.mjs";
import { bigintTruncationSource } from "../../../../tsonic/test/fixtures/bigint-truncation.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`generic absence preserves values and lazy fallback (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: `
      import type { int32, int64 } from "@tsonic/core/types.js";
      let effects: int32 = 0;
      function effectCount(): int32 { return effects; }
      function maybe<Value>(value: Value, present: boolean): Value | undefined {
        effects += 1;
        if (present) return value;
        return undefined;
      }
      function pick<Value>(value: Value | undefined, fallback: Value): Value { return value ?? fallback; }
      function narrow<Value>(value: Value | undefined, fallback: Value): Value {
        if (value === undefined) return fallback;
        return value;
      }
      function fallback(): int64 { effects += 10; return 9007199254740993n; }
      function closed(value: int64 | undefined): int64 { return pick<int64>(value, 7n); }
      function nullValue<Value>(value: Value, present: boolean): Value | null { return present ? value : null; }
      function invoke<Value>(callback: () => Value | undefined): Value | undefined { return callback(); }
      export function run(): boolean {
        const zero = maybe<int64>(0n, true);
        if (zero === undefined || zero !== 0n) return false;
        const present = maybe<int64>(9007199254740993n, true) ?? fallback();
        if (effectCount() !== 2 || present !== 9007199254740993n) return false;
        const absent = maybe<int64>(0n, false) ?? fallback();
        if (effectCount() !== 13 || absent !== 9007199254740993n) return false;
        const closedValue: int64 | undefined = maybe<int64>(9n, true);
        if (nullValue<int64>(0n, true) !== 0n || nullValue<int64>(0n, false) !== null ||
          pick<int64 | undefined>(undefined, 0n) !== 0n || invoke<int64>(() => 9n) !== 9n) return false;
        return narrow<int64>(zero, 1n) === 0n && pick<string>(maybe<string>("", true), "fallback") === "" &&
          pick<string>(undefined, "fallback") === "fallback" && closed(closedValue) === 9n && closed(undefined) === 7n;
      }
    ` }), `generic-absence-${surface ?? "native"}`);
  });
}

for (const surface of [undefined, "js"]) {
  test(`generic native optional containers retain storage and aliases (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int64 } from "@tsonic/core/types.js";
      function fill<Value>(values: (Value | undefined)[], value: Value): (Value | undefined)[] {
        values[0] = value;
        values[1] = undefined;
        return values;
      }
      function forward<Value>(values: (Value | undefined)[], value: Value): (Value | undefined)[] {
        return fill(values, value);
      }
      function fillNullish<Value>(values: (Value | null | undefined)[], value: Value): void {
        values[0] = value;
        values[1] = null;
        values[2] = undefined;
      }
      function pickNullish<Value>(value: Value | null | undefined, fallback: Value): Value { return value ?? fallback; }
      class Box<Value> {
        values: (Value | undefined)[];
        constructor(values: (Value | undefined)[]) { this.values = values; }
        put(value: Value): void { this.values[0] = value; }
        get(): Value | undefined { return this.values[0]; }
      }
      function capture<Value>(values: (Value | undefined)[]) {
        return class Captured {
          get(): Value | undefined { return values[0]; }
          put(value: Value): void { values[0] = value; }
        };
      }
      export function run(): boolean {
        const integers: (int64 | undefined)[] = [0n, 1n];
        const nullish: (int64 | null | undefined)[] = [undefined, null, undefined];
        fillNullish(nullish, 9007199254740993n as int64);
        if (nullish[0] !== 9007199254740993n || pickNullish<int64>(nullish[1], 0n) !== 0n ||
          pickNullish<int64>(nullish[2], 1n) !== 1n) return false;
        const alias = forward<int64>(integers, 9007199254740993n);
        if (alias !== integers || alias[0] !== 9007199254740993n || alias[1] !== undefined) return false;
        const integerBox = new Box<int64>(integers);
        integerBox.put(-9007199254740993n);
        if (integers[0] !== -9007199254740993n || integerBox.get() !== -9007199254740993n) return false;
        const Captured = capture(integers);
        const captured = new Captured();
        captured.put(9007199254740993n);
        if (captured.get() !== 9007199254740993n || integerBox.get() !== 9007199254740993n) return false;
        const strings: (string | undefined)[] = ["before", "after"];
        const stringBox = new Box<string>(strings);
        if (forward<string>(strings, "") !== strings || stringBox.get() !== "" || strings[1] !== undefined) return false;
        stringBox.put("value");
        return strings[0] === "value" && strings[1] === undefined;
      }
    ` });
    executeCsharpConstruction(compiled, `generic-native-optional-storage-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /Runtime\.Optional<|\.FromNullable|\.ToNullable|\.ToArray\(\)|\.Select\(/u);
    assert.match(output, /long\?/u);
    assert.match(output, /string\?/u);
  });
}

for (const [name, sourceText] of [["native-integer-complement", nativeIntegerComplementSource], ["nullish-never", nullishNeverSource],
  ["pointer-owner-narrowing", pointerOwnerNarrowingSource], ["bigint-truncation", bigintTruncationSource]]) {
  test(`${name} preserves checked native values and effects`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText }), name);
  });
}

test("module state is fully constructed before reads and preserves aliases", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: initializedModuleStateFiles,
    sourceText: initializedModuleStateFiles["index.ts"] }), "initialized-module-state");
});

test("checked satisfies tuples preserve distinct optional elements and evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: tupleSatisfiesSource }), "tuple-satisfies");
  for (const sourceText of invalidTupleSatisfiesSources) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("class factories retain distinct evaluation and constructor exception boundaries", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: classFactoryEffectsFiles,
    sourceText: classFactoryEffectsFiles["index.ts"] }), "class-factory-effects");
});

test("generic class statics share one native owner across closed instance types", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let effects: int32 = 0;
    function initialize(): int32 { effects += 1; return 0; }
    class Box<Value> {
      static count: int32 = initialize();
      value: Value;
      constructor(value: Value) { this.value = value; Box.count += 1; }
      static from<Value>(value: Value): Box<Value> { return new Box(value); }
    }
    function count(): int32 { return Box.count; }
    function effectCount(): int32 { return effects; }
    export function run(): boolean {
      if (count() !== 0 || effectCount() !== 1) return false;
      const number = Box.from<int32>(7 as int32);
      const text = Box.from<string>("stored");
      return number.value === 7 && text.value === "stored" && count() === 2 && effectCount() === 1;
    }
  ` });
  executeCsharpConstruction(compiled, "generic-class-static-owner");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /static class Box\b/u);
  assert.equal((generated.match(/static int count\s*(?:=|;)/gu) ?? []).length, 1);
});

test("bigint switches preserve wide equality, evaluation order and fallthrough", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: bigintSwitchSource }), "bigint-switch");
});

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  test(`nested structural storage preserves compound aliases and shared mutation (${profile})`, { timeout: 300_000 }, () => {
    const options = surface === undefined ? {} : { surface };
    executeCsharpConstruction(compileCsharpSource({ ...options, files: nestedStructuralStorageFiles,
      sourceText: nestedStructuralStorageFiles["index.ts"] }), `nested-structural-storage-${profile}`);
    for (const files of invalidNestedStructuralStorageFiles) {
      const invalid = checkCsharpSource({ ...options, files, sourceText: files["index.ts"] });
      assert.match(invalid.sourceDiagnosticsText, /error TS(?:2322|2345)/u);
    }
  });
}

test("native params preserve array-valued arguments and nested storage identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nestedArrayRestSource });
  executeCsharpConstruction(compiled, "nested-array-rest");
  assert.match(compiled.artifacts.get("src/Index.cs"), /values\.push\(first\);/u);
});

test("generic object methods retain native binders, independent bodies and shared captures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: genericObjectMethodFiles,
    sourceText: genericObjectMethodFiles["index.ts"] });
  executeCsharpConstruction(compiled, "generic-object-methods");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.match(shapes, /identity<[TU]>\([TU] value\)/u);
  assert.doesNotMatch(shapes, /(?:Func|Action)<[TU](?:, [TU])?> __tsonic_method/u);
  assert.doesNotMatch(shapes, /DynamicInvoke|System\.Reflection|System\.Linq\.Expressions/u);
  for (const sourceText of invalidGenericObjectMethods) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("generic method captures preserve parameters, destructuring and loop activation identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: genericObjectCaptureSource }), "generic-object-captures");
});

test("generic method values retain the original environment without a wrapper or delegate", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: genericObjectMethodValueSource });
  executeCsharpConstruction(compiled, "generic-object-method-values");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(generated, /DynamicInvoke|System\.Reflection|System\.Linq\.Expressions/u);
  assert.match(generated, /identity<[^>]+>/u);
  assert.doesNotMatch(generated, /Func<T,\s*T>\s+(?:identity|alias|escaped|selected)/u);
});

test("class structural views retain native reference identity across all value boundaries", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: classStructuralConversionFiles,
    sourceText: classStructuralConversionFiles["index.ts"] }), "class-structural-conversions");
  for (const sourceText of invalidClassStructuralConversions) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("union calls compose generic, default, rest and async contracts without dispatch closures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: unionCallContractsFiles,
    sourceText: unionCallContractsFiles["index.ts"] });
  executeCsharpConstruction(compiled, "union-call-contracts", true);
  const native = [...compiled.artifacts.values()].join("\n");
  assert.match(native, /private static [^\n]*__tsonic_union_call_/u);
  assert.doesNotMatch(native, /\.Match(?:<[^\n]+>)?\(/u);
  for (const sourceText of incompatibleUnionCalls) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("optional indexed arguments retain absence and single evaluation", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: optionalIndexedArgumentsSource }), "optional-indexed-arguments");
});
