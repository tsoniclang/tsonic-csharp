import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`scalar, array and callable payloads use closed native unions on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: { "values.ts": `
      export function first(value: string | string[]): string {
        return typeof value === "string" ? value : value[0]!;
      }
      export function call(value: string | ((amount: number) => number) | undefined): number {
        if (value === undefined) return -1;
        return typeof value === "function" ? value(4) : value === "abc" ? 3 : 0;
      }
    ` }, sourceText: `
      import { first, call } from "./values.js";
      function create(): string | ((amount: number) => number) | undefined {
        return amount => amount * 3;
      }
      export function run(): boolean {
        return first("left") === "left" && first(["right"]) === "right"
          && call("abc") === 3 && call(amount => amount * 2) === 8 && call(undefined) === -1
          && call(function(amount) { return amount + 2; }) === 6 && call(create()) === 12;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /DynamicInvoke|System\.Reflection/u);
    executeCsharpConstruction(compiled, `inferred-value-unions-${surface ?? "native"}`);
  });
}
