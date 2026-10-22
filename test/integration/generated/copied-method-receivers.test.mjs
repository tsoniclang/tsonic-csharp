import test from "node:test";
import { copiedMethodReceiversSource } from "../../../../tsonic/test/fixtures/copied-method-receivers.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import assert from "node:assert/strict";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`copied generic methods use the current exact native receiver (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: copiedMethodReceiversSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /SetsRequiredMembers|default!|DynamicInvoke|System\.Reflection/u);
    executeCsharpConstruction(compiled,
      `copied-method-receivers-${surface ?? "native"}`);
  });
  test(`copied generic methods reject incomplete receiver storage (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      const original = { count: 3, identity<T>(value: T): T { this.count++; return value; } };
      const { count, ...copied } = original;
      export function run(): number { return copied.identity(7); }
    ` });
    assert.equal(compiled.artifacts.size, 0);
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.message.includes("rest binding")), true);
  });
}
