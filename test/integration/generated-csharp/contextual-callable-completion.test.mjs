import assert from "node:assert/strict";
import test from "node:test";
import { contextualCallableCompletionSource, optionalCallableCompletionSource } from "../../../../tsonic/test/fixtures/contextual-callable-completion.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("contextual broad callbacks complete through their native absence storage", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: contextualCallableCompletionSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "contextual-callable-completion");
});

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`optional callable completion retains exact native absence in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalCallableCompletionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `optional-callable-completion-${lane}`);
  });
}

test("a contextual required result cannot invent an absence completion", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function take(handler: (present: boolean) => number): void {}
    export function run(): void { take(present => { if (present) return 7; }); }
  ` });
  assert.match(compiled.sourceDiagnosticsText, /TS2345/u);
  assert.equal(compiled.result.artifacts.length, 0);
});
