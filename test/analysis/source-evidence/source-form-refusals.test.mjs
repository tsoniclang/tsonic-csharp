import assert from "node:assert/strict";
import test from "node:test";
import { compileEffectiveSource, assertPublishedSourceFormRefusal } from "../../helpers/source-effective-types.mjs";

for (const surface of ["native", "js"]) test(`${surface}: export-equals retains the canonical nonvalue Source form refusal`, () => {
  const compiled = compileEffectiveSource(surface, `
    const value = 7;
    export = value;
  `, { compilerOptions: { module: "commonjs", moduleResolution: "node10" } });
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "the checker-valid original export-equals has one Source form refusal");
  assert.equal(compiled.targetSource.ast.is.IsExportAssignment(issues[0].sourceNode), true, "the exact original export assignment owns the refusal");
  assertPublishedSourceFormRefusal(compiled, issues[0], "Export-equals assignments have no supported Source module value form.", "export = value;");
});
