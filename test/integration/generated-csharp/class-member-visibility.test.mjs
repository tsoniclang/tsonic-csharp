import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { classMemberVisibilityFiles } from "../../../../tsonic/test/fixtures/class-member-visibility.mjs";

for (const surface of ["native", "js"]) {
  test(`checked member visibility retains native subclass and lexical dispatch (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: classMemberVisibilityFiles });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /private double bump\(/);
    assert.match(source, /protected virtual double read\(/);
    assert.match(source, /protected override double read\(/);
    assert.match(source, /protected Base\(/);
    executeCsharpConstruction(compiled, `class-member-visibility-${surface}`);
  });
}

test("checked private and protected members remain unavailable outside their owner", () => {
  const compiled = compileCsharpSource({ files: { ...classMemberVisibilityFiles,
    "index.ts": 'import { Child } from "./child.js"; const child = new Child(); child.bump(); child.read(); child.count;',
  } });
  assert.match(compiled.sourceDiagnosticsText, /private/);
  assert.match(compiled.sourceDiagnosticsText, /protected/);
});
