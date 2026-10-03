import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { selectedFiniteResultSource } from "../../../helpers/selected-finite-results.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected optional and finite overload returns use the native result owner (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: selectedFiniteResultSource });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /ulong selected\(/u);
    assert.match(emitted, /\.As[12]\(\)/u);
    assert.match(emitted, /\(\(Derived\)receiver\(reader\)\.fluent\(\)\)\.result\(\)/u);
    assert.doesNotMatch(emitted, /ReadDynamicSlot|dynamic\b|Unsafe\.|ContinueWith|Task\.Run|u64_to_f64/u);
  });
}

test("selected overload results reject an argument outside the checked signature family", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `${selectedFiniteResultSource}\nexport function rejected(reader: Derived): unknown { return reader.read("other"); }` });
  assert.match(compiled.sourceDiagnosticsText, /TS2769/u);
  assert.equal(compiled.result.artifacts.length, 0);
});
