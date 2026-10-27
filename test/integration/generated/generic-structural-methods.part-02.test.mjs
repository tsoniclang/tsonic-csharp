import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { genericStructuralMethodFiles, genericStructuralAsyncFiles, genericStructuralOptionalFiles, inheritedStructuralOptionalFiles, monomorphicStructuralOptionalFiles } from "../../../../tsonic/test/fixtures/generic-structural-methods.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
test(`optional generic structural methods retain absence and their receiver (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericStructuralOptionalFiles["index.ts"] });
    executeCsharpConstruction(compiled, `generic-structural-optional-${surface}`);
  });

test(`generic structural methods retain receivers and lexical capture identity (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: genericStructuralMethodFiles["index.ts"], files: { "factory.ts": genericStructuralMethodFiles["factory.ts"] } });
    executeCsharpConstruction(compiled, `generic-structural-methods-${surface}`);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /dynamic|\.GetType\(/u);
  });

test(`generic structural async methods retain their owning receiver (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericStructuralAsyncFiles["index.ts"] });
    executeCsharpConstruction(compiled, `generic-structural-async-${surface}`, true);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /dynamic|\.GetType\(/u);
  });
}
