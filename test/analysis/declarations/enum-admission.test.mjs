import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const numericUses = [
  ["float64 equality", "export function use(value: Value, operand: number): boolean { return value === operand; }"],
  ["int32 equality", "export function use(value: Value, operand: int32): boolean { return value === operand; }"],
  ["ordering", "export function use(left: Value, right: Value): boolean { return left < right; }"],
  ["arithmetic", "export function use(value: Value): number { return value + 1; }"],
  ["unary minus", "export function use(value: Value): number { return -value; }"],
  ["unary plus", "export function use(value: Value): number { return +value; }"],
  ["increment", "export function use(value: Value): Value { value++; return value; }"],
  ["numeric local", "export function use(value: Value): number { const result: number = value; return result; }"],
  ["numeric return", "export function use(value: Value): number { return value; }"],
  ["numeric argument", "function consume(value: number): number { return value; } export function use(value: Value): number { return consume(value); }"],
  ["complement numeric local", "export function use(value: Value): number { const result: number = ~value; return result; }"],
  ["complement arithmetic", "export function use(value: Value): number { return ~value + 1; }"],
  ["bitwise numeric return", "export function use(left: Value, right: Value): number { return left | right; }"],
  ["shift", "export function use(value: Value): number { return value << 1; }"],
];

for (const surface of [undefined, "js"]) {
  for (const [label, body] of numericUses) {
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

  for (const [label, sourceText] of [
    ["ordinary", "export enum Value { First = 1 } export enum Value { Second = 2 }"],
    ["cross-declaration collision", "export enum Value { First = 9007199254740992 } export enum Value { Second = 9007199254740993 }"],
    ["empty", "export enum Value {} export enum Value {}"],
  ]) {
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
