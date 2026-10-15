import assert from "node:assert/strict";
import test from "node:test";
import { nativeClosedValuesSource } from "../../../../tsonic/test/fixtures/native-closed-values.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native closed values retain exact primitive, absence and shared-object operations in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeClosedValuesSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /\.isUndefined\(\)/);
    assert.doesNotMatch(source, /ApplyDynamicLogical/);
    executeCsharpConstruction(compiled, `native-closed-values-${surface ?? "native"}`);
  });
}
