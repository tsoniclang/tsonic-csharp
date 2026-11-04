import assert from "node:assert/strict";
import test from "node:test";
import { nativeClosedValuesSource } from "../../../../tsonic/test/fixtures/native-closed-values.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { annotatedEmptyValues, assertUnfilledEmptyObject } from "../../helpers/source-effective-empty-values.mjs";

for (const surface of [undefined, "js"]) {
  test(`native closed values retain exact primitive, absence and shared-object operations in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    assertUnfilledEmptyObject(surface, nativeClosedValuesSource, 2);
  });

  test(`annotated native closed values retain every primitive absence and identity predicate in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: annotatedEmptyValues(nativeClosedValuesSource) });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /\.isUndefined\(\)/);
    assert.doesNotMatch(source, /ApplyDynamicLogical/);
    executeCsharpConstruction(compiled, `native-closed-values-${surface ?? "native"}`);
  });
}
