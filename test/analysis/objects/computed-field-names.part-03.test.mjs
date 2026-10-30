import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  assertCsharpCheckingSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramObjectLiteralShapes } from "../../helpers/program-source-files.mjs";
import { staticKeys } from "./computed-field-names.fixtures.mjs";

for (const surface of [undefined, "js"]){
test(`C# ${surface ?? "native"} static class fields and methods use one native name plan`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
const valueKey = "value";
const readKey = "read";
class Holder {
  [valueKey]: number = 7;
  [readKey](): number { return this[valueKey]; }
}
export function make(): number { return new Holder()[readKey](); }
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(generated.includes("read("), true, "computed method renders an ordinary native method");
    assert.equal(generated.includes("value"), true, "computed field renders ordinary native storage");
  });

test(`C# ${surface ?? "native"} imported computed fields use the declaration file's sealed evidence`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { Holder } from "./holder.js";
export function make(): number { const value: Holder = { value: 7 }; return value.value; }
`, files: { "holder.ts": 'const key = "value"; export interface Holder { [key]: number; }' } });
    assertCsharpCompilationSucceeded(compiled);
  });

test(`C# ${surface ?? "native"} computed method overloads keep their checked implementation`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
const key = "read";
class Holder {
  [key](value: number): number;
  [key](value: number): number { return value; }
}
export function make(): number { return new Holder()[key](7); }
` });
    assertCsharpCompilationSucceeded(compiled);
  });

test(`C# ${surface ?? "native"} constructor-spelled computed methods remain ordinary methods`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
const key = "constructor";
class Holder { [key](): number { return 7; } }
export function make(): number { return new Holder()[key](); }
` });
    assertCsharpCompilationSucceeded(compiled);
  });

test(`C# ${surface ?? "native"} inferred objects refuse disagreeing large numeric names`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function make(): number {
  const value = { [9007199254740993]: 7 };
  return value[9007199254740993];
}
` });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN").length, 2,
      "the inferred declaration and member access both require the same coherent name");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "the disagreement is rejected before sealing");
    assert.equal(compiled.result.artifacts.length, 0, "no rounded or unselectable native field is emitted");
  });

for (const key of ["-9007199254740993", "1152921504606846976", "18446744073709551616", "1.0000000000000001", "1e-400"]){
test(`C# ${surface ?? "native"} refuses numeric named key ${key} without a representability cap`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `export function make(): number { const value = { [${key}]: 1 }; return 0; }` });
      assertCsharpCheckingSucceeded(compiled);
      const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN");
      assert.equal(issues.length === 1 && issues[0].message.includes("checker key") && issues[0].message.includes("exact string key"), true,
        "one precise exact/checker name disagreement");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "the numeric mismatch is a pre-seal source rejection");
      assert.equal(compiled.result.artifacts.length, 0, "no dynamic or rounded-key fallback is emitted");
    });
}

for (const current of [
    { name: "dynamic argument", source: 'export function make(key: string): number { const value = { [key]: 1 }; return 0; }' },
    { name: "mutable literal binding", source: 'export function make(): number { let key: "value" = "value"; const value = { [key]: 1 }; return 0; }' },
    { name: "effectful singleton call", source: 'function key(): "value" { return "value"; } export function make(): number { const value = { [key()]: 1 }; return 0; }' },
    { name: "effectful property getter", source: 'const key = { get name(): "value" { return "value"; } }; export function make(): number { const value = { [key.name]: 1 }; return 0; }' },
    { name: "effectful enum receiver", source: 'enum Key { Value = 1 } const holder = { get selected(): typeof Key { return Key; } }; export function make(): number { const value = { [holder.selected.Value]: 1 }; return 0; }' },
  ]){
test(`C# ${surface ?? "native"} rejects ${current.name} before sealing`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: current.source });
      assertCsharpCheckingSucceeded(compiled);
      const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN");
      assert.equal(issues.length, 1, "one exact computed-field admission diagnostic");
      assert.equal(issues[0]?.category, "error", "nonconstant computed key is a source error");
      assert.equal(compiled.result.program === undefined, true, "invalid key is rejected before publication");
      assert.equal(compiled.result.plan === undefined, true, "invalid key never reaches the planner");
      assert.equal(compiled.result.artifacts.length, 0, "invalid key emits no native artifacts");
    });
}
}
