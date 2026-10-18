import assert from "node:assert/strict";
import test from "node:test";
import { nativeFinallyOverrideSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`native C# rejects control transfer leaving cleanup before publishing output in ${surface}`, () => {
    for (const sourceText of [nativeFinallyOverrideSource,
      "export function run(): void { while (true) { try {} finally { break; } } }",
      "export function run(): void { while (true) { try {} finally { continue; } } }"]) {
      const compiled = compileCsharpSource({ surface, sourceText });
      assert.equal(compiled.result.diagnostics.some(row => row.code === "CSHARP_NATIVE_FINALLY_CONTROL_TRANSFER"), true,
        "native cleanup transfer prohibition must be diagnosed at analysis");
      assert.equal(compiled.artifacts.size, 0, "invalid native control flow must not publish partial artifacts");
    }
  });
}
