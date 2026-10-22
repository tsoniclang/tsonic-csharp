import assert from "node:assert/strict";
import test from "node:test";
import { nativeParsingRadixSource } from "../../../../tsonic/test/fixtures/native-parsing-radix.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("both parsing APIs preserve native numeric radix carriers and optional absence", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: nativeParsingRadixSource }),
    "native-parsing-radix");
});

test("parsing radix normalization does not admit unrelated implicit native narrowing", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int32 } from "@tsonic/core/types.js";
function integer(value: int32): int32 { return value; }
export function run(value: number): int32 { return integer(value); }
` });
  assert.ok(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error"),
    "native floating-to-integer narrowing remains rejected");
  assert.equal(compiled.result.artifacts.length, 0);
});
