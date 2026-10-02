import test from "node:test";
import assert from "node:assert/strict";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { broadArrayViewSource, broadArrayCategoryWriteSource } from "../../../../tsonic/test/fixtures/broad-array-views.mjs";

test("checked broad array views retain their native backing and element identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: broadArrayViewSource }), "broad-array-views");
});

test("category-only indexed writes preserve the checked broad native backing", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: broadArrayCategoryWriteSource }), "broad-array-category-write");
});

for (const expression of ["value.push(8)", "value.at(1)", "value.map(item => item)"]) {
  test(`an array category cannot manufacture a typed receiver for ${expression}`, () => {
    const compiled = compileCsharpSource({ surface: "js",
      sourceText: `export function check(value: unknown): void { if (Array.isArray(value)) { ${expression}; } }`,
    });
    assert.equal(compiled.artifacts.size, 0);
    assert.ok(compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.sourceDiagnosticsText, "");
  });
}
