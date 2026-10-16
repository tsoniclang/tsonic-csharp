import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  assertCsharpCheckingSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";

const staticKeys = [
  { name: "string literal", prelude: "", key: '"value"', ordinary: "value" },
  { name: "numeric literal", prelude: "", key: "0x10", ordinary: "16" },
  { name: "negative numeric literal", prelude: "", key: "-1", ordinary: '"-1"' },
  { name: "zero numeric literal", prelude: "", key: "-0", ordinary: "0", declarationKey: "0" },
  { name: "fractional numeric literal", prelude: "", key: "1.5", ordinary: "1.5" },
  { name: "exponent numeric literal", prelude: "", key: "1e21", ordinary: "1e21", expected: "1e+21" },
  { name: "const string", prelude: 'const key = "value";', key: "key", ordinary: "value" },
  { name: "const numeric", prelude: "const key = 16;", key: "key", ordinary: "16" },
  { name: "numeric enum", prelude: "enum Key { Value = 16 }", key: "Key.Value", ordinary: "16" },
  { name: "parenthesized const", prelude: 'const key = "value";', key: "((key))", declarationKey: "key", ordinary: "value" },
  { name: "nonidentifier string", prelude: 'const key = "x-y";', key: "key", ordinary: '"x-y"' },
  { name: "empty string", prelude: 'const key = "";', key: "key", ordinary: '""' },
  { name: "exact large integer literal", prelude: "", key: "9007199254740993", ordinary: "9007199254740993", refused: true },
  { name: "exact large const integer", prelude: "const key = 9007199254740993;", key: "key", ordinary: "9007199254740993", refused: true },
  { name: "destructured const string", prelude: 'const { key } = { key: "value" } as const;', key: "key", ordinary: "value" },
  { name: "destructured const integer", prelude: "const [key] = [9007199254740993] as const;", key: "key", ordinary: "9007199254740993", refused: true },
  { name: "destructured spread const integer", prelude: "const prefix = [1, 9007199254740993] as const; const [, key] = [...prefix, 3] as const;", key: "key", ordinary: "9007199254740993", refused: true },
  { name: "coherent wide integer", prelude: "", key: "9007199254740994", ordinary: "9007199254740994" },
  { name: "coherent rounded binary integer spelling", prelude: "", key: "1152921504606847000", ordinary: "1152921504606847000" },
  { name: "radix exponent spelling", prelude: "", key: "0x3635c9adc5dea00000", ordinary: "1e21", expected: "1e+21" },
  { name: "reserved native identifier", prelude: 'const key = "class";', key: "key", ordinary: '"class"' },
];

for (const surface of [undefined, "js"]) {
  test(`C# ${surface ?? "native"} struct fields share checked computed names with finalized FieldFact evidence`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { field, struct } from "@tsonic/core/lang.js";
const key = "value";
export const Shape = struct({ ["ok"]: field<number>(), [key]: field<number>() });
export type Shape = typeof Shape;
export function read(value: Shape): number { return value.ok + value[key]; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(output.includes("ok") && output.includes("value"), true, "both checked field names reach native generation");
  });

  test(`C# ${surface ?? "native"} computed names do not admit a non-field struct initializer`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { struct } from "@tsonic/core/lang.js";
export const Shape = struct({ ["bad"]: 1 });
` });
    assert.equal(compiled.extensionDiagnostics.some(issue => issue.numericCode === 9901109), true,
      "the existing source-core field marker requirement remains authoritative");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a static name does not manufacture FieldFact type evidence");
    assert.equal(compiled.result.artifacts.length, 0, "an invalid struct has no native artifacts");
  });

  test(`C# ${surface ?? "native"} regular string enums are refused for ordinary and computed fields`, () => {
    for (const computed of [false, true]) {
      const compiled = compileCsharpSource({ surface, sourceText: `
enum Key { Value = "value" }
interface Holder { ${computed ? "[Key.Value]" : "value"}: number; }
export function make(): number {
  const value: Holder = { ${computed ? "[Key.Value]" : "value"}: 7 };
  return value[Key.Value];
}
` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_ENUM_CONSTANT_NOT_SUPPORTED").length, 1,
        `${computed ? "computed" : "ordinary"} field preserves the precise native enum-domain refusal`);
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
        "a regular string enum is refused before sealing, not misclassified as an unknown key");
      assert.equal(compiled.result.artifacts.length, 0, "no unadmitted native enum is emitted");
    }
  });
  for (const current of staticKeys) {
    test(`C# ${surface ?? "native"} ${current.refused ? "refuses a conflicting checker identity for" : "admits"} ${current.name} as an ordinary exact field`, () => {
      if (current.refused) {
        for (const computed of [false, true]) {
          const compiled = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { ${computed ? `[${current.declarationKey ?? current.key}]` : current.ordinary}: number; }
export function make(): number {
  const value: Holder = { ${computed ? `[${current.key}]` : current.ordinary}: 7 };
  return value[${current.key}];
}
` });
          assertCsharpCheckingSucceeded(compiled);
          const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN");
          assert.equal(issues.length > 0 && issues.every(issue => issue.message.includes("checker key") && issue.message.includes("exact string key")), true,
            "every conflicting named identity has the precise shared admission reason");
          assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "R1 rejects before sealing and planning");
          assert.equal(compiled.result.artifacts.length, 0, "R1 emits no incorrect native field");
        }
        return;
      }
      const compiled = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { [${current.declarationKey ?? current.key}]: number; }
export function make(): number {
  const value: Holder = { [${current.key}]: 7 };
  return value[${current.key}];
}
` });
      assertCsharpCompilationSucceeded(compiled);
      const ordinary = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { ${current.ordinary}: number; }
export function make(): number {
  const value: Holder = { ${current.ordinary}: 7 };
  return value[${current.key}];
}
` });
      assertCsharpCompilationSucceeded(ordinary);
      assert.equal(compiled.result.program !== undefined, true, "analyzed computed-field program exists");
      assert.equal(compiled.result.plan !== undefined, true, "computed-field program reaches planning");
      assert.equal(compiled.result.artifacts.length > 0, true, "computed-field program emits native artifacts");
      const expectedName = current.expected ?? (current.ordinary.startsWith('"') ? JSON.parse(current.ordinary) : current.ordinary);
      assert.equal(compiled.result.program.objectShapes.knownShapes().some(shape => shape.members.some(member =>
        member.sourceKey.kind === "property" && member.sourceKey.name === expectedName)), true,
      "sealed native member preserves the exact source key, not a rounded checked spelling");
    });
  }

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

  for (const key of ["-9007199254740993", "1152921504606846976", "18446744073709551616", "1.0000000000000001", "1e-400"]) {
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
    { name: "effectful enum receiver", source: 'enum Key { Value = "value" } const holder = { get selected(): typeof Key { return Key; } }; export function make(): number { const value = { [holder.selected.Value]: 1 }; return 0; }' },
  ]) {
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
