import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";

for (const surface of ["native", "js"]) {
  test(`homogeneous native floating arrays preserve nonintegral, special and large values on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { float64 } from "@tsonic/core/types.js";
export function run(): boolean {
  const first: float64 = 0.5;
  const values = [first, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e100];
  return values[0] === 0.5 && Number.isNaN(values[1]) && values[2] === Number.POSITIVE_INFINITY &&
    values[3] === Number.NEGATIVE_INFINITY && values[4] === 1e100;
}` });
    assert.equal(compiled.result.diagnostics.length, 0, compiled.result.diagnostics.slice(0, 8)
      .map(issue => csharpSourceDiagnosticLabel(compiled.source, issue)).join("\n"));
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(generated.includes("double"), true, "every already-selected floating slot retains the exact native carrier");
    assert.equal(/BigInteger|Convert\.ToDouble|TsUnion/u.test(generated), false,
      "native floating identity does not acquire an integer, dynamic union or conversion transport");
    executeCsharpConstruction(compiled, `homogeneous-floating-array-${surface}`);
  });
}
