import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { voidCompletionSource } from "../../../../tsonic/test/fixtures/void-completions.mjs";

for (const surface of ["native", "js"]) {
  test(`void adaptation retains the physical lambda body completion on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: voidCompletionSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the complete native lambda program is admitted");
    let lambdas = 0;
    const visit = node => {
      if (program.source.ast.is.IsArrowFunction(node)) {
        lambdas += 1;
        assert.equal(program.records.lambdaBody.get(node)?.completion, "absence",
          "the physical value-returning lambda produces absence before its contextual void adapter");
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(lambdas, 1, "the authored callback is inspected exactly once");
  });

  test(`void completions preserve effects and native absence on ${surface}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: voidCompletionSource }), `void-completions-${surface}`);
  });
}
