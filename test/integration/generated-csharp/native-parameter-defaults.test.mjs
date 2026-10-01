import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeParameterDefaultsSource } from "../../../../tsonic/test/fixtures/native-parameter-defaults.mjs";

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
}
