import assert from "node:assert/strict";
import test from "node:test";
import { localProtectedAsyncSource, localProtectedErrorRegionSource, localProtectedIntrinsicSource,
  localProtectedModuleSource } from "../../../../tsonic/test/fixtures/local-protected-error-regions.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of [["synchronous", localProtectedErrorRegionSource],
    ["module", localProtectedModuleSource], ["asynchronous", localProtectedAsyncSource]]) {
    test(`local protected errors retain ${name} identity and completion order (${surface})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
      assert.match(output, /\btry\b/u, "the existing CLR renderer retains actual native local protection");
      assert.match(output, /\bcatch\b/u, "the native exception handler is not replaced by a Result wrapper");
      executeCsharpConstruction(compiled, `local-protected-${name}-${surface}`, name === "asynchronous");
    });
  }
}

test("CLR local protection preserves a pure callback's independent intrinsic error", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: localProtectedIntrinsicSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "local-protected-intrinsic", false);
});
