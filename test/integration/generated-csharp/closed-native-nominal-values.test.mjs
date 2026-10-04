import assert from "node:assert/strict";
import test from "node:test";
import { closedNativeNominalValuesSource } from "../../../../tsonic/test/fixtures/closed-native-nominal-values.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`closed native nominal owners retain aliases, inheritance and mutation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: closedNativeNominalValuesSource +
      '\nexport function main(): void { if (!run()) throw new Error("closed native nominal values"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator/u.test([...compiled.artifacts.values()].join("\n")), false,
      "closed nominal recovery uses checked native storage");
    executeCsharpConstruction(compiled, `closed-native-nominal-values-${surface}`);
  });
}
