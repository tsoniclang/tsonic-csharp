import assert from "node:assert/strict";
import test from "node:test";
import { inferredOptionalNumericResultFiles } from "../../../../tsonic/test/fixtures/inferred-optional-numeric-results.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`inferred optional numeric producers retain their exact ABI in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: inferredOptionalNumericResultFiles["index.ts"],
      files: { "counts.ts": inferredOptionalNumericResultFiles["counts.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const counts = compiled.artifacts.get("src/Counts.cs");
    const index = compiled.artifacts.get("src/Index.cs");
    assert.match(counts, /int\? length\(/u);
    assert.match(counts, /long\? wide\(/u);
    for (const name of ["floating", "fractional"]) {
      assert.match(counts, new RegExp(`double\\? ${name}\\(`, "u"));
    }
    assert.match(index, /int\? local\(/u);
    assert.doesNotMatch(index, /Convert\.ToDouble|BigInteger/u);
    executeCsharpConstruction(compiled, `inferred-optional-numeric-${lane}`, false, false, [], `
var values = new byte[] { 1, 2, 3 };
for (int index = 0; index < 1000; index++) {
    if (!Tsonic.Generated.Index.run(values)) throw new System.Exception("exact optional numeric results");
}
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) {
    if (!Tsonic.Generated.Index.run(values)) throw new System.Exception("exact optional numeric results");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("optional results must not allocate");
`);
  });
}
