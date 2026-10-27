import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { absenceObservations, absenceSource, absenceProjectionRefusals, numericUses, stringUses } from "./enum-admission.fixtures.mjs";

for (const [label, declaration] of Array.from([
  ["function", 'function String(value: Value): string { return "custom"; }'],
  ["callable variable", 'var String = (value: Value): string => "custom";'],
]).slice(0, 2)) {
test(`C# native user-global String ${label} is not a builtin conversion`, () => {
    const compiled = compileCsharpSource({ sourceText: `enum Value { First = 1 } ${declaration} String(Value.First);` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.artifacts.length > 0, true, "the real non-JS user global remains native code");
  });
}

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
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

for (const [label, body] of Array.from(absenceProjectionRefusals).slice(0, 6)) {
test(`C# ${surface ?? "native"} absence observation does not admit ${label}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.result.diagnostics.length, 1, `${label}: one actual projection`);
      assert.equal(compiled.result.diagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared refusal`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejected before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no native output`);
    });
}

for (const [label, body] of Array.from(numericUses).slice(0, 63)) {
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

if (surface === "js") {}

for (const [label, body] of Array.from([
    ["same-enum mutable destination", "export function use(value: Value): Value { let result: Value = value; result = value; return result; }"],
    ["wrapped same-enum mutable destination", "export function use(value: Value): Value { let result: Value = value; (result = value); return result; }"],
    ["same-enum class field", "export class Holder { value: Value = Value.First; }"],
    ["same-enum parameter default", "export function use(value: Value = Value.First): Value { return value; }"],
    ["same-enum assertion", "export function use(value: Value): Value { return value as Value; }"],
    ["actual instantiated T", "function identity<T>(value: T): T { return value; } export function use(value: Value): Value { return identity<Value>(value); }"],
    ["enum-containing union destination", "function accept(value: Value | string): void {} export function use(value: Value): void { accept(value); }"],
    ["fixed tuple enum index", "export function use(values: [number, number]): number { return values[Value.First]; }"],
    ["static enum key metadata", "interface Named { [Value.First]: number; } export function use(value: Named): number { return value[Value.First]; }"],
  ]).slice(0, 9)) {
test(`C# ${surface ?? "native"} retains closed enum twin ${label}`, () => {
      const sourceText = `export enum Value { First = 1, Second = 2 } ${body}`;
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true, `${label}: actual native program`);
      assert.equal(compiled.result.artifacts.length > 0, true, `${label}: retained native emission`);
    });
}

for (const [label, body, requiresJsLibrary] of Array.from(stringUses).slice(0, 1)) {
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

for (const [label, body, requiresJsLibrary] of Array.from(stringUses).slice(4, 8)) {
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

test(`C# ${surface ?? "native"} composed enum values retain native identity and effects`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export enum Value { First = 1, Second = 2 }
function touch(state: { count: number }): void { state.count = state.count + 1; }
export function run(flag: boolean): boolean {
  const state = { count: 0 };
  const selected = flag ? ~Value.First : ~Value.Second;
  const copied = (touch(state), selected);
  return state.count === 1 && copied === (flag ? ~Value.First : ~Value.Second);
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `enum-composition-${surface ?? "native"}`, false, false, [], `
if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false))
    throw new System.Exception("generated enum composition");
NativeValue left = ~NativeValue.First;
NativeValue right = ~NativeValue.Second;
if ((true ? left : right) != ~NativeValue.First || (false ? left : right) != ~NativeValue.Second)
    throw new System.Exception("native enum composition");
enum NativeValue { First = 1, Second = 2 }
`);
  });

test(`C# ${surface ?? "native"} refuses the checker-equal wide mixed comparison before target selection`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export enum High { Value = 9007199254740993 }
export function equal(): boolean { return High.Value === 9007199254740992; }
` });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.length, 1, "the standalone exact enum remains valid; only its numeric use is refused");
    assert.equal(compiled.targetDiagnostics[0].code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", "there is no internal missing-fact path");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "the source rule is pre-seal");
    assert.equal(compiled.result.artifacts.length, 0, "no rounded native comparison is emitted");
  });

for (const [label, sourceText] of Array.from([
    ["ordinary", "export enum Value { First = 1 } export enum Value { Second = 2 }"],
    ["cross-declaration collision", "export enum Value { First = 9007199254740992 } export enum Value { Second = 9007199254740993 }"],
    ["empty", "export enum Value {} export enum Value {}"],
  ]).slice(0, 3)) {
test(`C# ${surface ?? "native"} refuses ${label} merged enum declarations once`, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length, 1, "one checked symbol owns one diagnostic before the native catalog");
      assert.equal(compiled.targetDiagnostics[0].code, "TSONIC_ENUM_MERGED_DECLARATIONS_NOT_SUPPORTED", "shared merged-enum code");
      assert.equal(compiled.targetDiagnostics[0].message, "Enum 'Value' has 2 declarations; tsonic supports one declaration per enum.", "shared merged-enum text");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "no conflicting native definition is published");
      assert.equal(compiled.result.artifacts.length, 0, "merged enum output never reaches the native compiler");
    });
}

test(`C# ${surface ?? "native"} refuses cross-file checked merged enum membership once`, () => {
    // RULINGS 2026-10-22: the merged-enum refusal test sets script mode for its own fixtures; the subject is merging
    // across script files, which module mode (the helper default) cannot express.
    const compiled = compileCsharpSource({ surface, compilerOptions: { moduleDetection: "auto" },
      sourceText: "export function run(): number { return 42; }", files: {
      "first.ts": "enum Value { First = 9007199254740992 }",
      "second.ts": "enum Value { Second = 9007199254740993 }",
    } });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.length, 1, "consumer-local merged symbols still have one actual declaration group");
    assert.equal(compiled.targetDiagnostics[0]?.code, "TSONIC_ENUM_MERGED_DECLARATIONS_NOT_SUPPORTED", "merged admission precedes R2 and native layout");
    assert.equal(compiled.targetDiagnostics[0]?.message, "Enum 'Value' has 2 declarations; tsonic supports one declaration per enum.",
      "both targets consume the same checked membership and reason");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.result.artifacts.length === 0, true,
      "no partial enum definitions are emitted");
  });

test(`C# ${surface ?? "native"} retains native same-enum equality and bitwise domains`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export enum Value { First = 1, Second = First << 1 }
export function equal(left: Value, right: Value): boolean { return left === right; }
export function combine(left: Value, right: Value): Value { return left | right; }
export function complement(value: Value): Value { return ~value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(output.includes("return left | right;") && output.includes("return ~value;"), true,
      "native enum bitwise results are not projected through a plain number");
  });
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
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

for (const [label, body] of Array.from(absenceProjectionRefusals).slice(0, 6)) {
test(`C# ${surface ?? "native"} absence observation does not admit ${label}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `enum Value { First = 1, Second = 2 } ${body}` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.result.diagnostics.length, 1, `${label}: one actual projection`);
      assert.equal(compiled.result.diagnostics[0]?.code, "TSONIC_ENUM_NUMERIC_USE_NOT_SUPPORTED", `${label}: shared refusal`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, `${label}: rejected before seal`);
      assert.equal(compiled.result.artifacts.length, 0, `${label}: no native output`);
    });
}

for (const [label, body] of Array.from(numericUses).slice(0, 44)) {
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

if (surface === "js") {}
}
