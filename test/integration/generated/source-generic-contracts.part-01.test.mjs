import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { optionalIndexedArgumentsSource } from "../../../../tsonic/test/fixtures/optional-indexed-arguments.mjs";
import { unionCallContractsFiles, incompatibleUnionCalls } from "../../../../tsonic/test/fixtures/union-call-contracts.mjs";
import { classStructuralConversionFiles, invalidClassStructuralConversions } from "../../../../tsonic/test/fixtures/class-structural-conversions.mjs";
import { genericObjectMethodFiles, genericObjectCaptureSource, genericObjectMethodValueSource, invalidGenericObjectMethods } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { nestedArrayRestSource } from "../../../../tsonic/test/fixtures/nested-array-rest.mjs";
import { optionalArrayComparisonSource } from "../../../../tsonic/test/fixtures/optional-array-comparisons.mjs";
import { nestedStructuralStorageFiles, invalidNestedStructuralStorageFiles } from "../../../../tsonic/test/fixtures/nested-structural-storage.mjs";
import { bigintSwitchSource } from "../../../../tsonic/test/fixtures/bigint-switch.mjs";
import { classFactoryEffectsFiles } from "../../../../tsonic/test/fixtures/class-factory-effects.mjs";
import { authoredLocalTypesFiles } from "../../../../tsonic/test/fixtures/authored-local-types.mjs";
import { tupleSatisfiesSource, invalidTupleSatisfiesSources } from "../../../../tsonic/test/fixtures/tuple-satisfies.mjs";
import { initializedModuleStateFiles } from "../../../../tsonic/test/fixtures/initialized-module-state.mjs";
import { nativeIntegerComplementSource } from "../../../../tsonic/test/fixtures/native-integer-complement.mjs";
import { nullishNeverSource } from "../../../../tsonic/test/fixtures/nullish-never.mjs";
import { pointerOwnerNarrowingSource } from "../../../../tsonic/test/fixtures/pointer-owner-narrowing.mjs";
import { bigintTruncationSource } from "../../../../tsonic/test/fixtures/bigint-truncation.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
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

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
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

for (const [name, sourceText] of Array.from([["native-integer-complement", nativeIntegerComplementSource], ["nullish-never", nullishNeverSource],
  ["pointer-owner-narrowing", pointerOwnerNarrowingSource], ["bigint-truncation", bigintTruncationSource]]).slice(0, 4)) {
test(`${name} preserves checked native values and effects`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText }), name);
  });
}

test("module state is fully constructed before reads and preserves aliases", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: initializedModuleStateFiles,
    sourceText: initializedModuleStateFiles["index.ts"] }), "initialized-module-state");
});

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
test(`module declarations are not source absence expressions (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export class State { count: int32; constructor(count: int32) { this.count = count; } }
export let state: State;
export let absent: State | undefined = undefined;
export function run(): boolean {
  if (absent !== undefined) return false;
  state = new State(7);
  const alias = state;
  state.count = 9;
  return alias === state && alias.count === 9;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const declarations = [];
    const ast = compiled.result.program.source.ast;
    const collect = node => {
      if (ast.is.IsVariableDeclaration(node)) declarations.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) collect(child); });
    };
    for (const sourceFile of csharpProgramSourceFiles(compiled.result.program)) collect(sourceFile);
    const state = declarations.find(node => ast.text(ast.name(node)) === "state");
    const absent = declarations.find(node => ast.text(ast.name(node)) === "absent");
    const modes = compiled.result.program.records.moduleBindingInitialization;
    assert.equal(modes.get(state), "declaration", "no initializer is a native declaration");
    assert.equal(modes.get(absent), "value", "explicit absence remains a real source initializer");
    assert.equal(modes.get({}) === undefined, true, "foreign source identity does not borrow declaration evidence");
    assert.equal(Object.isFrozen(modes), true, "published module initialization decisions are immutable");
    executeCsharpConstruction(compiled, `module-declaration-only-${surface ?? "native"}`);
  });

test(`module declaration admission does not admit invalid source absence (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export class State { count: number = 1; }
export let state: State = undefined;
export function run(): boolean { return state.count === 1; }
` });
    assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true,
      "explicit absence cannot initialize a nonoptional native state");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a rejected source initializer never reaches the seal or planner");
    assert.equal(compiled.artifacts.size, 0, "invalid source absence emits no native artifact");
  });

test(`module declaration admission preserves definite-assignment errors (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export class State { count: number = 1; }
export function run(): boolean {
  let local: State;
  return local.count === 1;
}
` });
    assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true,
      "the module-only selection does not legalize an unassigned local read");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "definite-assignment rejection stays before sealing");
    assert.equal(compiled.artifacts.size, 0, "an unassigned local emits no native artifact");
  });
}

test("checked satisfies tuples preserve distinct optional elements and evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: tupleSatisfiesSource }), "tuple-satisfies");
  for (const sourceText of invalidTupleSatisfiesSources) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});
