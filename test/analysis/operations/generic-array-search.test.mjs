import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("generic find and findLast use the existing native optional storage evidence without erasing the element", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
function first<Value>(values: Value[], expected: Value): Value | undefined {
  return values.find(actual => actual === expected);
}
function last<Value>(values: Value[], expected: Value): Value | undefined {
  return values.findLast(actual => actual === expected);
}
export function run(): boolean {
  const wide = 9007199254740993n as int64;
  return first([0, 7], 0) === 0 && first([0, 7], 11) === undefined &&
    last([wide, 0n as int64, wide], wide) === wide && last(["first", "last"], "absent") === undefined;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes("IOptionalStorage<"), true,
    "one existing native optional operations constraint owns present and absent correspondence");
  assert.equal(/\.find(?:Last)?<[^;]+OptionalStorage/u.test(generated), true,
    "the actual runtime call carries the exact optional storage and operations arguments");
  assert.equal(/Array\.find(?:Last)?Reference<Value>|Array\.find(?:Last)?Value<Value>/u.test(generated), false,
    "an unconstrained generic is not assigned a fabricated class or struct constraint");
  executeCsharpConstruction(compiled, "generic-array-search");
});
