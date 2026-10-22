import assert from "node:assert/strict";
import test from "node:test";
import { callableInputDomainSource, callableInputDomainDeclaration, callableInputDomainObservedCaller } from "../../../../tsonic/test/fixtures/callable-input-domains.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`exported callback ABI remains invariant under additional observed callers in ${lane}`, () => {
    const signatures = [];
    for (const sourceText of [callableInputDomainDeclaration, callableInputDomainDeclaration + callableInputDomainObservedCaller]) {
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const source = compiled.artifacts.get("src/Index.cs");
      assert.equal(source !== undefined, true);
      const signature = source.match(/public static string apply\([^\n]+/u)?.[0];
      assert.equal(signature !== undefined, true, "one emitted public declaration");
      signatures.push(signature);
    }
    assert.equal(signatures[0], signatures[1], "local observations cannot change an externally callable native ABI");
  });

  test(`mixed owning and borrowing native callbacks execute through one declared input ABI in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: callableInputDomainSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `callable-input-domains-${lane}`);
  });
}
