import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { absenceObservations, absenceSource, absenceProjectionRefusals, numericUses, stringUses } from "./enum-admission.fixtures.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)){
test(`C# ${surface ?? "native"} enum absence observations match the single native absence state`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: absenceSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "an absence observation retains the enum domain without numeric projection");
    executeCsharpConstruction(compiled, `enum-absence-${surface ?? "native"}`, false, false, [], `
foreach (bool flag in new[] { true, false }) {
    NativeValue? selected = flag ? NativeValue.First : null;
    NativeValue? joined = flag ? NativeValue.Second : null;
    foreach (NativeValue? value in new[] { selected, joined, selected }) {
        if (value.HasValue != flag || (value == null) != !flag || (null != value) != flag)
            throw new System.Exception("native enum absence counterpart");
    }
    if ((selected ?? NativeValue.First) != NativeValue.First || !Tsonic.Generated.Index.run(flag))
        throw new System.Exception("native enum absence composition");
}
enum NativeValue { First = 1, Second = 2 }
`);
  });

for (const [label, body] of Array.from(absenceProjectionRefusals).slice(0, 6)){
test(`C# ${surface ?? "native"} absence observation does not admit ${label}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.result.diagnostics.length, 1, `${label}: one actual projection`);
      assert.equal(compiled.result.diagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared refusal`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejected before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no native output`);
    });
}

for (const [label, body, requiresJsLibrary] of Array.from(stringUses).slice(0, 1)){
if (requiresJsLibrary && surface !== "js") continue;

test(`C# ${surface ?? "native"} refuses enum ${label} with the shared string-conversion reason`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `export enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length, 1, `${label}: one actual string conversion`);
      assert.equal(compiled.targetDiagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared code`);
      assert.equal(compiled.targetDiagnostics[0]?.message,
        "Enum value 'Value' is converted to a string; enum-to-string conversion is not supported yet.", `${label}: no native-name substitution`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejection before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no miscompiled native output`);
    });
}

for (const [label, body, requiresJsLibrary] of Array.from(stringUses).slice(4, 8)){
if (requiresJsLibrary && surface !== "js") continue;

test(`C# ${surface ?? "native"} refuses enum ${label} with the shared string-conversion reason`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `export enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length, 1, `${label}: one actual string conversion`);
      assert.equal(compiled.targetDiagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared code`);
      assert.equal(compiled.targetDiagnostics[0]?.message,
        "Enum value 'Value' is converted to a string; enum-to-string conversion is not supported yet.", `${label}: no native-name substitution`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejection before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no miscompiled native output`);
    });
}

test(`C# ${surface ?? "native"} local String and user formatting functions retain their actual identity`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export enum Value { First = 1 }
function String(value: Value): string { return "custom"; }
function format(value: Value): string { return "named"; }
export function use(value: Value): string { return String(value) + format(value); }
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.artifacts.length > 0, true, "neither callee spelling nor a string return type creates a conversion");
  });
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)){
test(`C# ${surface ?? "native"} enum absence observations match the single native absence state`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: absenceSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "an absence observation retains the enum domain without numeric projection");
    executeCsharpConstruction(compiled, `enum-absence-${surface ?? "native"}`, false, false, [], `
foreach (bool flag in new[] { true, false }) {
    NativeValue? selected = flag ? NativeValue.First : null;
    NativeValue? joined = flag ? NativeValue.Second : null;
    foreach (NativeValue? value in new[] { selected, joined, selected }) {
        if (value.HasValue != flag || (value == null) != !flag || (null != value) != flag)
            throw new System.Exception("native enum absence counterpart");
    }
    if ((selected ?? NativeValue.First) != NativeValue.First || !Tsonic.Generated.Index.run(flag))
        throw new System.Exception("native enum absence composition");
}
enum NativeValue { First = 1, Second = 2 }
`);
  });

for (const [label, body] of Array.from(absenceProjectionRefusals).slice(0, 6)){
test(`C# ${surface ?? "native"} absence observation does not admit ${label}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.result.diagnostics.length, 1, `${label}: one actual projection`);
      assert.equal(compiled.result.diagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared refusal`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejected before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no native output`);
    });
}
}
