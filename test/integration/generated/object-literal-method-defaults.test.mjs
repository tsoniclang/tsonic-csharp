import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const source = `import type { int32 } from "@tsonic/core/types.js";
export function omittedText(): string {
  const o = { m(x: string = "d"): string { return x; } };
  return o.m();
}
export function presentText(): string {
  const o = { m(x: string = "d"): string { return x; } };
  return o.m("p");
}
export function omittedNumber(): int32 {
  const o = { m(x: int32 = 5): int32 { return x; } };
  return o.m();
}
export function omittedPattern(): int32 {
  const o = { m({ a }: { a: int32 } = { a: 6 }): int32 { return a; } };
  return o.m();
}
export function run(): boolean {
  return omittedText() === "d" && presentText() === "p" && omittedNumber() === 5 && omittedPattern() === 6;
}
`;

for (const surface of ["native", "js"]) {
  test(`object-literal method defaults are applied in the method body (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: source });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/\bstring m\(string\? (__tsonic_param\d+) = null\)\s*\{\s*string x = \1 \?\? "d";/u.test(output), true,
      "the native method applies its string default to the exact nullable incoming parameter");
    assert.equal(/\bint m\(int\? (__tsonic_param\d+) = null\)\s*\{\s*int x = \1 \?\? 5;/u.test(output), true,
      "the native method applies its int32 default to the exact nullable incoming parameter");
    executeCsharpConstruction(compiled, `object-literal-method-defaults-${surface}`);
  });
}
