import assert from "node:assert/strict";
import test from "node:test";
import { capturedCallbackAritySource } from "../../../../tsonic/test/fixtures/captured-callback-arity.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`captured native methods retain their sealed arity independently of contextual callbacks (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: capturedCallbackAritySource });
      assertCsharpCompilationSucceeded(compiled);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal(/ObjectShape_capture_/u.test(generated), true, "the deferred binding exercises a native frame");
      assert.equal(/public void invoke\d+\(\)/u.test(generated), true, "the zero-parameter body is not widened to its contextual delegate");
      assert.equal(/public void invoke\d+\(double first, double second\)/u.test(generated), true,
        "the two-parameter body and its adapter agree on the exact physical arity");
      assert.equal(/public void invoke\d+\(double first\)/u.test(generated), true,
        "function expressions use the same sealed native-method contract as arrows");
      assert.equal(/public void invoke\d+\(double first, double second, double third\)/u.test(generated), true,
        "an authored third parameter is preserved");
      assert.equal([...generated.matchAll(/new ObjectShape_capture_/gu)].length, 1,
        "all captured methods reuse the one actual activation");
      executeCsharpConstruction(compiled, `captured-callback-arity-${surface ?? "native"}`);
    });
}
