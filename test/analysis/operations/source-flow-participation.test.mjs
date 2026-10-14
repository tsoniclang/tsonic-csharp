import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const header = 'import { move } from "@tsonic/core/lang.js"; import type { int } from "@tsonic/csharp/types.js";';

for (const [name, discarded] of [
  ["arrow statement", "() => move(value);"],
  ["function expression statement", "(function (): int { return move(value); });"],
  ["void arrow", "void (() => move(value));"],
  ["unused local function", "function hidden(): int { return move(value); }"],
]) test(`a nonparticipating ${name} never rejects or emits its unsupported native body`, () => {
  const expected = compileCsharpSource({ sourceText: header + "export function f(value: int): int { return value; }" });
  const actual = compileCsharpSource({ sourceText: header + `export function f(value: int): int { ${discarded} return value; }` });
  assert.equal(expected.sourceDiagnosticsText, "");
  assert.equal(actual.sourceDiagnosticsText, "");
  assert.equal(expected.result.diagnostics.length, 0);
  assert.equal(actual.result.diagnostics.length, 0);
  assert.equal(expected.artifacts.size > 0, true);
  assert.deepEqual([...actual.artifacts], [...expected.artifacts], "complete native output has no discarded-body work");
});

test("an erased safety value root does not consume or execute its source-flow marker", () => {
  const compiled = compileCsharpSource({ sourceText: header + `
    import { safety } from "@tsonic/core/lang.js";
    const value: int = 1 as int;
    safety(move(value)).requiresunsafe();
    export const k = 1;
  `, targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  assert.equal(compiled.artifacts.size > 0, true);
});

for (const [name, body] of [
  ["stored arrow", "export function f(value: int): int { const g = (): int => move(value); return value; }"],
  ["invoked arrow", "export function f(value: int): int { const g = (): int => move(value); return g(); }"],
  ["returned arrow", "export function f(value: int): () => int { return (): int => move(value); }"],
  ["invoked local function", "export function f(value: int): int { function g(): int { return move(value); } return g(); }"],
  ["module function", "function g(value: int): int { return move(value); } export const k = 1;"],
  ["overload implementation", "export function f(value: int): int; export function f(value: int): int { return move(value); }"],
  ["abstract class concrete method", "export abstract class A { abstract m(): int; n(value: int): int { return move(value); } }"],
]) test(`the participating ${name} retains its precise unsupported-source-flow rejection`, () => {
  const compiled = compileCsharpSource({ sourceText: header + body });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED"), true);
  assert.equal(compiled.artifacts.size, 0);
});
