import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { binaryEntryNativePrograms } from "../../../../tsonic/test/fixtures/binary-entry-contract.mjs";

for (const surface of [undefined, "js"]) {
  test(`binary entry rejects uncalled main on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, targetOptions: { outputType: "Exe" },
      sourceText: "export function main(): void {}" });
    assert.equal(compiled.artifacts.size, 0);
    assert.deepEqual(compiled.result.diagnostics.map(diagnostic => diagnostic.code), ["TSONIC_UNCALLED_BINARY_ENTRY_MAIN"]);
  });

  for (const [name, source] of [
    ["explicit", 'export function main(): void { console.log("entry ran"); } main();'],
    ["top_level", 'console.log("entry ran");'],
    ["async", 'export async function main(): Promise<void> { console.log("entry ran"); } await main();'],
  ]) {
    test(`binary ${name} runs exactly once on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const sourceText = surface === undefined
        ? binaryEntryNativePrograms[name]
        : source;
      const compiled = compileCsharpSource({ surface, targetOptions: { outputType: "Exe" }, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.artifacts.has("generated/TsonicEntrypoint.cs"), true);
      assert.equal(executeCsharpConstruction(compiled, `entry-${name}-${surface ?? "native"}`), surface === undefined ? "" : "entry ran\n");
    });
  }

  test(`library main remains an uninvoked export on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: "export function main(): void {}" });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.artifacts.has("generated/TsonicEntrypoint.cs"), false);
    assert.match([...compiled.artifacts.values()].join("\n"), /void main\(\)/u);
  });
}
