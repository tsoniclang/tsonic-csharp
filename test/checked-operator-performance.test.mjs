import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("checked operators use direct TSTS mapping without lifecycle AST rescans", () => {
  const extension = readFileSync(new URL("../src/source/csharp-source-semantics/native-extension.ts", import.meta.url), "utf8");
  const mapper = readFileSync(new URL("../src/source/csharp-source-semantics/checked-operator-mapping/index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(extension, /checked-operator-lifecycle/u);
  assert.doesNotMatch(extension, /recordCsharpCheckedOperatorFactsBeforeFinalization/u);
  assert.match(mapper, /mapCsharpCheckedOperator/u);
  assert.doesNotMatch(mapper, /getSourceFiles\s*\(/u);
  assert.doesNotMatch(mapper, /visitAstReaderNodes/u);
});
