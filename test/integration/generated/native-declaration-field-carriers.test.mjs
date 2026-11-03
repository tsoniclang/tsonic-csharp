import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native class reads retain declared marker widths and optional bigint on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { field } from "@tsonic/core/lang.js";
import type { int32, int64 } from "@tsonic/core/types.js";
class Marked {
  narrow = field<int32>();
  wide = field<int64>();
  maybe = field<int64 | undefined>();
}
class Plain { value?: bigint; }
export function run(): boolean {
  const marked = new Marked();
  const plain = new Plain();
  const alias = plain;
  if (marked.maybe !== undefined || plain.value !== undefined) return false;
  marked.narrow = 17;
  marked.wide = 9007199254740993n;
  marked.maybe = marked.wide;
  plain.value = 9007199254740993n;
  return marked.narrow === 17 && marked.wide === 9007199254740993n &&
    marked.maybe === 9007199254740993n && alias === plain &&
    alias.value === 9007199254740993n;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = compiled.artifacts.get("src/Index.cs");
    assert.equal(output.includes("public int narrow;"), true, "the explicit int32 declaration remains authoritative");
    assert.equal(output.includes("public long wide;"), true, "the explicit int64 declaration remains authoritative");
    assert.equal(output.includes("public long? maybe;"), true, "native optional int64 storage is not bigint storage");
    assert.equal(output.includes("public System.Numerics.BigInteger? value;"), true,
      "a genuinely declared optional bigint retains its own native BigInteger carrier");
    assert.equal(/marked\.maybe\s*=\s*marked\.wide;/u.test(output), true,
      "the native field read is assigned directly without a width cast or wrapper");
    executeCsharpConstruction(compiled, `native-declaration-field-carriers-${surface}`);
  });
}
