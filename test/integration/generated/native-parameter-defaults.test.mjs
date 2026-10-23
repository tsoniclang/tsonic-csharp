import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeAbsentParameterDefaultsSource, nativeParameterDefaultsSource, orderedParameterDefaultsSource } from "../../../../tsonic/test/fixtures/native-parameter-defaults.mjs";

for (const surface of ["native", "js"]) {
  test(`an effectful exact absence default retains native evaluation (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let calls = 0;
      function callCount(): number { return calls; }
      function next(): undefined { calls++; return undefined; }
      function named(value: string | null | undefined = next()): string | null | undefined { return value; }
      const deferred = (value: string | null | undefined = next()): string | null | undefined => value;
      export function run(): boolean {
        if (named("first") !== "first" || deferred("second") !== "second" || callCount() !== 0) return false;
        if (named() !== undefined || deferred() !== undefined) return false;
        if (named(null) !== undefined || deferred(undefined) !== undefined) return false;
        return callCount() === 4;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `effectful-native-absence-defaults-${surface}`);
  });

  test(`native constant absent defaults retain nullable scalars, classes and structs (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAbsentParameterDefaultsSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /string\? value = null/u);
    assert.match(source, /long\? value = null/u);
    assert.match(source, /string\? undefinedText\(string\? value = null\)\s*\{\s*return value;\s*\}/u);
    assert.doesNotMatch(source, /Nullable<[^>]*Nullable|ApplyDynamicLogical/u);
    executeCsharpConstruction(compiled, `native-absent-parameter-defaults-${surface}`);
  });

  test(`native broad parameter defaults retain absence, present values and callee effects (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeParameterDefaultsSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /default\(.*TsValue\)/);
    assert.match(source, /\.isUndefined\(\)\s*\?/);
    assert.doesNotMatch(source, /Nullable<[^>]*TsValue|TsValue\?|ApplyDynamicLogical/);
    executeCsharpConstruction(compiled, `native-parameter-defaults-${surface}`);
  });

  test(`default-before-required slots retain required arity and callee effects (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: orderedParameterDefaultsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `ordered-parameter-defaults-${surface}`);
  });
}

test("default-before-required source calls cannot omit a mandatory slot", () => {
  const checked = checkCsharpSource({ sourceText: orderedParameterDefaultsSource + `
    constant(); constant(1); ordered(); deferred(undefined); new Holder();
    destructured(); destructured({ value: 0 }); positional(); positional([0]);
  ` });
  assert.equal([...checked.sourceDiagnosticsText.matchAll(/error TS2554:/gu)].length, 9);
});

for (const surface of ["native", "js"]) {
  test(`generic defaults retain checked value binders, absence and callee-side effects (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      let calls: int32 = 0;
      function callCount(): int32 { return calls; }
      function next(): int32 { calls += 1; return 7; }
      function choose<Value>(fallback: Value, actual: Value = fallback): Value { return actual; }
      function deferred<Value>(fallback: () => Value, actual: Value = fallback()): Value { return actual; }
      export function run(): boolean {
        calls = 0;
        return choose<int32>(5) === 5 && choose<int32>(5, 9) === 9 &&
          choose<int32>(5, undefined) === 5 && choose<string>("first", undefined) === "first" &&
          choose<string>("first", "second") === "second" &&
          deferred<int32>(next, 11) === 11 && callCount() === 0 &&
          deferred<int32>(next) === 7 && callCount() === 1 &&
          deferred<int32>(next, undefined) === 7 && callCount() === 2;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /\bOptionalStorage_\w+\s+\w+\s*=\s*default\(OptionalStorage_\w+\)/u,
      "the actual generic storage parameter uses a legal native default");
    assert.doesNotMatch(source, /\bOptionalStorage_\w+\s+\w+\s*=\s*null\b/u,
      "the open native generic carrier is never incorrectly declared nullable");
    executeCsharpConstruction(compiled, `generic-native-parameter-defaults-${surface}`);
  });
}
