import assert from "node:assert/strict";
import test from "node:test";
import { sourceOutcome } from "../../../dist/policy/types/source-type-flow/representation-results.js";
import { csharpRepresentationDiagnostic } from "../../../dist/analysis/source-evidence/representations.js";
import { compileEffectiveSource, assertPublishedSourceFormRefusal } from "../../helpers/source-effective-types.mjs";

for (const surface of ["native", "js"]) test(`${surface}: export-equals retains its actual Source refusal through the representation unit boundary`, () => {
  const compiled = compileEffectiveSource(surface, `
    const value = 7;
    export = value;
  `, { compilerOptions: { module: "commonjs", moduleResolution: "node10" } });
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "the checker-valid original export-equals has one Source form refusal");
  assert.equal(compiled.source.ast.is.IsExportAssignment(issues[0].sourceNode), true, "the exact original export assignment owns the refusal");
  const refusal = assertPublishedSourceFormRefusal(compiled, issues[0], "Export-equals assignments have no supported Source module value form.", "export = value;");
  const outcome = sourceOutcome(refusal);
  assert.equal(outcome.kind, "source-refused", "the typed unit boundary does not turn a Source refusal into a Native reason");
  assert.equal(outcome.refusal === refusal, true, "the unit contract forwards the SAME actual refusal without reconstructing a lazy-constraint program");
  const diagnostic = csharpRepresentationDiagnostic(outcome);
  assert.equal(diagnostic.code, refusal.code);
  assert.equal(diagnostic.source, refusal.source);
  assert.equal(diagnostic.message, refusal.message);
  assert.equal(diagnostic.category, "error");
  assert.equal(diagnostic.sourceNode === refusal.site, true, "the original unsupported runtime form remains the diagnostic site");
  assert.equal(compiled.source.facts.refusals().includes(outcome.refusal), true,
    "representation forwarding retains the identical observed per-view inventory object");
});
