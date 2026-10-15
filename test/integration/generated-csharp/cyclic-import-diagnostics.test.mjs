import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function compileCycle(mode) {
  const invalid = mode === "invalid";
  const defaults = mode === "defaults";
  return compileCsharpSource({ surface: invalid ? "js" : undefined,
    sourceText: `import { first } from "./first.js"; export function run(): boolean { return first() === ${defaults ? 6 : 3}; }`,
    files: {
      "first.ts": `import { second } from "./second.js"; import type { Second } from "./second.js";
        export interface First { next?: Second; } export function first(value: number = ${defaults ? "second()" : "0"}): number { ${invalid ? 'eval("1");' : ""} return second() + value; }`,
      "second.ts": `import type { First } from "./first.js"; export interface Second { next?: First; }
        function defaultValue(): number { return 0; } export function second(value: number = ${defaults ? "defaultValue()" : "0"}): number { ${invalid ? 'eval("2");' : ""} return 3 + value; }`,
    } });
}

test("type-import cycles retain concrete planning diagnostics without publishing artifacts", { timeout: 60_000 }, () => {
  const compiled = compileCycle("invalid");
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.targetDiagnostics.length, 2, JSON.stringify(compiled.targetDiagnostics));
  for (const diagnostic of compiled.targetDiagnostics) {
    assert.equal(diagnostic.code, "TS9101002");
    assert.match(diagnostic.message, /eval requires runtime source evaluation with lexical-scope access/u);
  }
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TARGET_ARTIFACT_BLOCKED_WITHOUT_PROGRESS"), false);
  assert.equal(compiled.result.artifacts.length, 0);
});

test("valid type-import cycles retain the finalized public and implementation contracts", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCycle("valid"), "cyclic-import-contracts");
});

test("nonconstant defaults in type-import cycles retain ordinary source execution", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCycle("defaults"), "cyclic-import-defaults");
});
