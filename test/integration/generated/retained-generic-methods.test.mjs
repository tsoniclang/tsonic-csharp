import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericObjectMethodStorageSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";

for (const surface of [undefined, "js"]) {
  test(`retained generic methods preserve state, body identity and copied values (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericObjectMethodStorageSource });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /identity<[^>]+>/u);
    assert.doesNotMatch(generated, /DynamicInvoke|System\.Reflection|System\.Linq\.Expressions/u);
    executeCsharpConstruction(compiled, `retained-generic-methods-${surface ?? "native"}`);
  });
}
