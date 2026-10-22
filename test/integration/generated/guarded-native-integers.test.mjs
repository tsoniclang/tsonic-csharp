import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { guardedNativeIntegerSource, unguardedNativeIntegerSource } from "../../../../tsonic/test/fixtures/guarded-native-integers.mjs";

for (const surface of [undefined, "js"]) {
  test(`guarded native integer arithmetic retains exact width (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: guardedNativeIntegerSource });
    executeCsharpConstruction(compiled, `guarded-native-integers-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /\(ulong\)value/u);
    assert.match(output, /\(nuint\)value/u);
    assert.doesNotMatch(output, /double|Int128/u);
  });
  test(`unguarded signed arithmetic cannot enter an unsigned native carrier (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: unguardedNativeIntegerSource });
    assert.notEqual(compiled.targetDiagnostics.length, 0);
    assert.equal(compiled.result.artifacts.length, 0);
  });
}
