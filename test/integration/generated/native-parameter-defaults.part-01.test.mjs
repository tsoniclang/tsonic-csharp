import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeAbsentParameterDefaultsSource, nativeParameterDefaultsSource, orderedParameterDefaultsSource } from "../../../../tsonic/test/fixtures/native-parameter-defaults.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
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
