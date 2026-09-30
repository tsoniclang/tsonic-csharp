import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function compileCycle(invalid) {
  return compileCsharpSource({ sourceText: 'import { first } from "./first.js"; export function run(): boolean { return first() === 3; }',
    files: {
      "first.ts": `import { second } from "./second.js"; import type { Second } from "./second.js";
        export interface First { next?: Second; } export function first(value: number = ${invalid ? "second()" : "0"}): number { return second() + value; }`,
      "second.ts": `import type { First } from "./first.js"; export interface Second { next?: First; }
        function defaultValue(): number { return 0; } export function second(value: number = ${invalid ? "defaultValue()" : "0"}): number { return 3 + value; }`,
    } });
}

test("type-import cycles retain concrete planning diagnostics without publishing artifacts", { timeout: 60_000 }, () => {
  const compiled = compileCycle(true);
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.targetDiagnostics.length, 2, JSON.stringify(compiled.targetDiagnostics));
  for (const diagnostic of compiled.targetDiagnostics) {
    assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST");
    assert.match(diagnostic.message, /C# parameter defaults require compile-time literal values/u);
  }
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TARGET_ARTIFACT_BLOCKED_WITHOUT_PROGRESS"), false);
  assert.equal(compiled.result.artifacts.length, 0);
});

test("valid type-import cycles retain the finalized public and implementation contracts", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCycle(false), "cyclic-import-contracts");
});
