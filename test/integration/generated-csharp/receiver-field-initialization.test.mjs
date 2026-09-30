import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { receiverFieldInitializationSource } from "../../../../tsonic/test/fixtures/receiver-field-initialization.mjs";

for (const surface of ["native", "js"]) {
  test(`receiver field initialization retains ordered construction and live callbacks (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: receiverFieldInitializationSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /double snapshot\s*=\s*this\./);
    assert.match(source, /this\.snapshot\s*=/);
    executeCsharpConstruction(compiled, `receiver-field-initialization-${surface}`);
  });
}
