import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
import type { int32, uint64 } from "@tsonic/core/types.js";
let effects: int32 = 0;
function fallback(): int32 { effects++; return 7; }
function readEffects(): int32 { return effects; }
export function run(): boolean {
  const integers: int32[] = [3, 4];
  const [first, second] = integers;
  let assigned: int32 = 0;
  [assigned] = integers;
  const [[nested]]: int32[][] = [[5]];
  const [present = fallback()] = integers;
  const empty: int32[] = [];
  const [missing = fallback()] = empty;
  const optional: (int32 | undefined)[] = [undefined, 9];
  const [absent, optionalPresent] = optional;
  const [defaulted = fallback()] = optional;
  const wide: uint64[] = [9007199254740993n];
  const [exact] = wide;
  return first + second === 7 && assigned === 3 && nested === 5 && present === 3 &&
    missing === 7 && absent === undefined && optionalPresent === 9 && defaulted === 7 &&
    readEffects() === 2 && exact === 9007199254740993n;
}
`;

for (const surface of [undefined, "js"]) {
  test(`dense array bindings retain exact native elements and lazy explicit defaults (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    executeCsharpConstruction(compiled, "dense-array-bindings");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /int first = [^;]+\[0\];/);
    assert.match(output, /ulong exact = [^;]+\[0\];/);
    assert.doesNotMatch(output, /int\? first|ulong\? exact/);
  });
}
