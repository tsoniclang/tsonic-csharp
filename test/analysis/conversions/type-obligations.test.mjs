import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpNativeTypeObligations } from "../../../dist/analysis/conversions/type-obligations.js";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";

const programs = [
  ["native scalar storage", "export function run(value: int32): int64 { const stored: int64 = value; return stored; }"],
  ["computed scalar storage", "export function run(): int32 { const stored: int32 = 1 + 2; return stored; }"],
  ["empty and grouped spreads", "export function run(value: int32): int64[] { return [...([] as const), ...([1, value] as const), 2]; }"],
  ["explicit floating allocation", "export function run(value: float32): float32[] { return [value, 1]; }"],
  ["ordered bound constraints", "function same<Value extends number>(value: Value): Value { return value; } export function run(value: int32): int32 { return same(value); }"],
];

assert.deepEqual(programs.map(([name]) => name), ["native scalar storage", "computed scalar storage",
  "empty and grouped spreads", "explicit floating allocation", "ordered bound constraints"]);
const surfaces = ["native", "js"];
assert.deepEqual(surfaces, ["native", "js"]);

for (const surface of surfaces) for (const [name, sourceText] of programs) {
  test(`${surface} Native obligation production preserves ${name} on the same completed program`, () => {
    const compiled = analyzeCsharpSource({ surface, sourceText:
      'import type { int32, int64, float32 } from "@tsonic/core/types.js";\n' + sourceText });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.analysis.kind, "resolved", "the genuine program must complete before inspecting Native obligations");
    const program = compiled.analysis.value;
    const analysis = program.analysis;
    assert.equal(analysis.policy.facts === compiled.source.facts, true, "no detached Source owner is constructed");
    assert.equal(program.representation === analysis.policy.representation, true, "the actual canonical representation is reused");
    assert.equal(analysis.expectedTypes.nativeUseSites.requests.some(request => request.kind === "requested"), true,
      "an empty expected-use inventory cannot vacuously discharge the program");
    assert.equal(analysis.nativeDemand.entries.some(entry => entry.use.kind !== "erased"), true,
      "the same physical Native use domain is mandatory");
    const issues = analyzeCsharpNativeTypeObligations({ policy: analysis.policy, expected: analysis.expectedTypes,
      nativeDemand: analysis.nativeDemand, compileTimeMetadata: analysis.sourceEvidence.compileTimeMetadata });
    assert.equal(issues.length, 0, `${name}: original completed Native writes and construction contributions remain admitted`);
  });
}
