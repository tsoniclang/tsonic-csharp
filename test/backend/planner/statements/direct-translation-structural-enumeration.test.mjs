import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

for (const [name, sourceText] of [
  ["unproved optional presence", `export function keys(value: { count?: number }): string {
    let text = ""; for (const key in value) text += key; return text;
  }
  export const result = keys({});`],
  ["nominal prototype members", `class Value { count = 1; method(): number { return this.count; } }
  export function keys(value: Value): string {
    let text = ""; for (const key in value) text += key; return text;
  }`],
]) {
  test(`for-in does not invent keys from ${name}`, () => {
    const result = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(result.sourceDiagnosticsText, "");
    assert.deepEqual(result.extensionDiagnostics, []);
    assert.ok(result.targetDiagnostics.some(diagnostic => diagnostic.category === "error"));
    assert.equal(result.artifacts.size, 0);
  });
}
