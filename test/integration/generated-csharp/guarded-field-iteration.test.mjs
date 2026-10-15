import test from "node:test";
import { guardedFieldIterationFiles } from "../../../../tsonic/test/fixtures/guarded-field-iteration.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`guarded cross-file fields retain exact array iteration in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: guardedFieldIterationFiles["index.ts"],
      files: { "options.ts": guardedFieldIterationFiles["options.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `guarded-field-iteration-${surface ?? "native"}`, true, false, [],
      "await Tsonic.Generated.Index.main();");
  });
}
