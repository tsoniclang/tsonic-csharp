import assert from "node:assert/strict";
import test from "node:test";
import { booleanValueShortCircuitSource } from "../../../../../tsonic/test/fixtures/boolean-value-short-circuit.mjs";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`boolean-controlled native values preserve width and lazy evaluation in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: booleanValueShortCircuitSource });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.extensionDiagnostics.length, 0, "the unchanged shared fixture checks");
    assert.equal(compiled.targetDiagnostics.length, 0, compiled.targetDiagnostics.map(diagnostic => diagnostic.message).join("\n"));
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/ulong value/u.test(source), true, "native unsigned width survives");
    assert.equal(/9007199254740993UL/u.test(source), true, "the exact native u64 literal survives printing");
    assert.equal(/double|TsValue|Dynamic|new .*Capture|new (?:global::)?System\.Func/u.test(source), false,
      "closed scalar unions and direct local functions do not add floating carriers or heap callables");
  });
}
