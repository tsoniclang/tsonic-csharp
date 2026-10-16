import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`C# ${surface ?? "native"} renders exact admitted enum discriminants and their common width`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { Base } from "./base.js";
export enum Empty {}
export enum Small { First, Second, Bits = 1 << 1, Negative = ~0 }
export enum Wide { Exact = 9007199254740993, Next = 9007199254740994, Same = Exact, Imported = Base.Value + 4 }
export enum Bounds { Low = -9223372036854775808, High = 9223372036854775807 }
`, files: { "base.ts": "export enum Base { Value = 9007199254740994 }" } });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.entries()].filter(([name]) => name.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.match(output, /enum Empty : int/u);
    assert.match(output, /enum Small : int/u);
    assert.match(output, /First = 0/u);
    assert.match(output, /Second = 1/u);
    assert.match(output, /Bits = 2/u);
    assert.match(output, /Negative = -1/u);
    assert.match(output, /enum Wide : long/u);
    assert.match(output, /Exact = 9007199254740993L/u);
    assert.match(output, /Next = 9007199254740994L/u);
    assert.match(output, /Same = 9007199254740993L/u);
    assert.match(output, /Imported = 9007199254740998L/u);
    assert.match(output, /Low = long.MinValue/u);
    assert.match(output, /High = 9223372036854775807L/u);
    assert.equal(output.includes("Base.Value +"), false, "the renderer does not re-evaluate authored enum expressions");
  });

  for (const [name, declaration] of [
    ["implicit rounded successor", "export enum Value { Exact = 9007199254740993, Next }"],
    ["incoherent imported arithmetic", "import { Base } from './base.js'; export enum Value { Imported = Base.Value + 3 }"],
    ["incoherent arithmetic remainder", "export enum Value { Sum = 9007199254740993 + 2, Remainder = Sum % 4 }"],
    ["distinct values sharing a checker identity", "export enum Value { Low = 9007199254740992, High = 9007199254740993 }"],
  ]) {
    test(`C# ${surface ?? "native"} refuses ${name} before native enum publication`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: declaration,
        files: { "base.ts": "export enum Base { Value = 9007199254740995 }" } });
      assertCsharpCheckingSucceeded(compiled);
      const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_ENUM_CONSTANT_NOT_SUPPORTED");
      assert.equal(issues.length === 1 && issues[0].message.includes("exact value") && issues[0].message.includes("checker value"), true,
        "one canonical enum admission refusal preserves both source authorities");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
        "the inconsistent enum cannot cross the seal");
      assert.equal(compiled.result.artifacts.length, 0, "no native enum with a contradictory checked type is emitted");
    });
  }

  test(`C# ${surface ?? "native"} refuses regular string enums at their existing early native-type owner`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: 'export enum Text { Value = "value" }' });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_ENUM_CONSTANT_NOT_SUPPORTED");
    assert.equal(issues.length, 1, "one precise native enum-domain diagnostic");
    assert.equal(issues[0]?.message.includes("string enums"), true, "the refusal identifies the native representation constraint");
    assert.equal(compiled.result.program === undefined, true, "an unadmitted enum never crosses the seal");
    assert.equal(compiled.result.plan === undefined, true, "an unadmitted enum never reaches the planner");
    assert.equal(compiled.result.artifacts.length, 0, "an unadmitted enum emits no native source");
  });
}
