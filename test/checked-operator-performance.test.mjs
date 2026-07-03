import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("checked operator lifecycle uses one postorder pass instead of fixpoint rescans", () => {
  const source = readFileSync(new URL("../src/source/csharp-source-semantics/checked-operator-lifecycle.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /while\s*\(\s*progressed\s*\)/u);
  assert.doesNotMatch(source, /progressed\s*=\s*true/u);
  assert.match(source, /for\s*\(\s*const node of nodes\.reverse\(\)\s*\)/u);
});
