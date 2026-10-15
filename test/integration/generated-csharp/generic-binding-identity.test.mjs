import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredGenericBinderFiles } from "../../../../tsonic/test/fixtures/authored-generic-binders.mjs";

test("authored generic binders retain spelling and independent captured identities", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: authoredGenericBinderFiles,
    sourceText: authoredGenericBinderFiles["index.ts"] });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /\bidentity<T>\(T value\)/u);
  assert.match(generated, /\bpair<T>\(T value\)/u);
  assert.doesNotMatch(generated, /\b(?:identity|pair)<T[0-9]+>/u);
  executeCsharpConstruction(compiled, "authored-generic-binders");
});
