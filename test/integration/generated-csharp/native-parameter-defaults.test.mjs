import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeParameterDefaultsSource, orderedParameterDefaultsSource } from "../../../../tsonic/test/fixtures/native-parameter-defaults.mjs";

for (const surface of ["native", "js"]) {
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
