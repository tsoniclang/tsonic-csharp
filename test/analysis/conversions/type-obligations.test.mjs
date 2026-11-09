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
  ["selected quantified callbacks", `function same<Value extends number>(value: Value): Value { return value; }
    function sameWide<Value extends bigint>(value: Value): Value { return value; }
    export function run(): boolean {
      const callback: (value: int32) => int32 = same;
      const wideCallback: (value: int64) => int64 = sameWide;
      const wide: int64 = 9007199254740993n;
      return callback(7) === 7 && wideCallback(wide) === wide;
    }`],
  ["admitted Native integer use", "export function run(values: int32[], index: int64): int32 { return values[index]; }"],
];

assert.deepEqual(programs.map(([name]) => name), ["native scalar storage", "computed scalar storage",
  "empty and grouped spreads", "explicit floating allocation", "ordered bound constraints",
  "selected quantified callbacks", "admitted Native integer use"]);
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
    if (name === "selected quantified callbacks") {
      const selected = analysis.nativeDemand.entries.flatMap(entry => {
        const use = entry.use;
        if (use.kind !== "converted" || use.input.kind !== "value") return [];
        const conversion = analysis.conversions.expressionConversion.get(use.expression, use.input.type, use.target, use.mode);
        return conversion?.selection.kind === "delegate-adapter" && conversion.selection.members.sourceApplication !== undefined
          ? [compiled.source.ast.text(use.expression)] : [];
      });
      assert.deepEqual([...new Set(selected)].sort(), ["same", "sameWide"],
        "both complete original selected Native generic applications must exist before obligation admission");
    }
    if (name === "admitted Native integer use") {
      assert.equal(analysis.nativeDemand.entries.some(entry => {
        const use = entry.use;
        return use.kind === "converted" && use.input.kind === "value" &&
          analysis.conversions.expressionConversion.get(use.expression, use.input.type, use.target, use.mode)?.selection.kind === "checked-native-integer";
      }), true, "the original integer-use proof, not a second carrier choice, is retained");
    }
    const issues = analyzeCsharpNativeTypeObligations({ policy: analysis.policy, expected: analysis.expectedTypes,
      nativeDemand: analysis.nativeDemand, compileTimeMetadata: analysis.sourceEvidence.compileTimeMetadata,
      conversions: analysis.conversions });
    assert.equal(issues.length, 0, `${name}: original completed Native writes and construction contributions remain admitted`);
    if (name === "selected quantified callbacks") {
      assert.throws(() => analyzeCsharpNativeTypeObligations({ policy: analysis.policy, expected: analysis.expectedTypes,
        nativeDemand: analysis.nativeDemand, compileTimeMetadata: analysis.sourceEvidence.compileTimeMetadata,
        conversions: { delegateAdapter: analysis.conversions.delegateAdapter, expressionConversion: { get: () => undefined } } }),
      /same already-admitted expression conversion/u,
      "a missing mandatory Native receipt is an invariant, never a fresh carrier-only selection or success");
    }
  });
}
