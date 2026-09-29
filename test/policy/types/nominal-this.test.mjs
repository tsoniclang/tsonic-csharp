import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`fluent generic classes retain nominal self types on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Holder<Value> {
        value: Value;
        constructor(value: Value) { this.value = value; }
        ${Array.from({ length: 24 }, (_, index) => `step${index}(): this { return this; }`).join("\n")}
      }
      export function run(): boolean {
        const holder = new Holder("preserved");
        return holder.step0().step12().step23().value === "preserved";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    for (let index = 0; index < 24; index += 1) {
      assert.match(emitted, new RegExp(`Holder<Value> step${index}\\(\\)`));
    }
    executeCsharpConstruction(compiled, `nominal-this-${surface ?? "native"}`);
  });
}
