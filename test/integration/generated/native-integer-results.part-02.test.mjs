import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";
import { nativeNumericTextFunctions } from "../../../../tsonic/test/fixtures/native-numeric-text.mjs";
import { numericApiFormattingSource } from "../../../../tsonic/test/fixtures/numeric-api-formatting.mjs";

for (const expression of Array.from(["BigInt.asIntN(bits, value)", "BigInt.asIntN(65, value)", "BigInt.asUintN(64, value)"]).slice(0, 3)) {
test(`native signed conversion rejects an unproved result: ${expression}`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function narrow(bits: number, value: bigint): int64 { return ${expression}; }
` });
    assert(compiled.result.diagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  });
}

test("a same-spelled local call cannot obtain the built-in integer proof", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function narrow(value: bigint): int64 {
  const BigInt = { asIntN(bits: number, operand: bigint): bigint { return operand; } };
  return BigInt.asIntN(64, value);
}
` });
  assert(compiled.result.diagnostics.length > 0);
  assert.equal(compiled.artifacts.size, 0);
});
