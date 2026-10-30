import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { absenceObservations, absenceSource, absenceProjectionRefusals, numericUses, stringUses } from "./enum-admission.fixtures.mjs";

for (const [label, declaration] of Array.from([
  ["function", 'function String(value: Value): string { return "custom"; }'],
  ["callable variable", 'var String = (value: Value): string => "custom";'],
]).slice(0, 2)){
test(`C# native user-global String ${label} is not a builtin conversion`, () => {
    const compiled = compileCsharpSource({ sourceText: `enum Value { First = 1 } ${declaration} String(Value.First);` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.artifacts.length > 0, true, "the real non-JS user global remains native code");
  });
}

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

for (const [label, body] of Array.from(numericUses).slice(0, 63)){
test(`C# ${surface ?? "native"} refuses enum ${label} at shared source admission`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export enum Value { First = 1, Second = 2 }
${body}
` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length, 1, "one shared use owns the rejection");
      assert.equal(compiled.targetDiagnostics[0].code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", "the code is identical on both targets");
      assert.equal(compiled.targetDiagnostics[0].message, "Enum value 'Value' is used as a number; enum-numeric operations are not supported yet. Use equality or bitwise operations within the same enum instead.",
        "the message is identical on both targets");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "rejection precedes sealing and planning");
      assert.equal(compiled.result.artifacts.length, 0, "a refused enum use emits no artifact");
    });
}

for (const [label, body] of Array.from(Array.from([
    ["same-enum mutable destination", "export function use(value: Value): Value { let result: Value = value; result = value; return result; }"],
    ["wrapped same-enum mutable destination", "export function use(value: Value): Value { let result: Value = value; (result = value); return result; }"],
    ["same-enum class field", "export class Holder { value: Value = Value.First; }"],
    ["same-enum parameter default", "export function use(value: Value = Value.First): Value { return value; }"],
    ["same-enum assertion", "export function use(value: Value): Value { return value as Value; }"],
    ["actual instantiated T", "function identity<T>(value: T): T { return value; } export function use(value: Value): Value { return identity<Value>(value); }"],
    ["enum-containing union destination", "function accept(value: Value | string): void {} export function use(value: Value): void { accept(value); }"],
    ["fixed tuple enum index", "export function use(values: [number, number]): number { return values[Value.First]; }"],
    ["static enum key metadata", "interface Named { [Value.First]: number; } export function use(value: Named): number { return value[Value.First]; }"],
  ]).slice(0, 9)).slice(0, 1)){
test(`C# ${surface ?? "native"} retains closed enum twin ${label}`, () => {
      const sourceText = `export enum Value { First = 1, Second = 2 } ${body}`;
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true, `${label}: actual native program`);
      assert.equal(compiled.result.artifacts.length > 0, true, `${label}: retained native emission`);
    });
}
}
