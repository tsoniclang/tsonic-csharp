import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpAnalysisTarget, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { binaryEntryNativePrograms } from "../../../../tsonic/test/fixtures/binary-entry-contract.mjs";

for (const surface of [undefined, "js"]) {
  test(`binary entry rejects uncalled main on ${surface ?? "native"}`, () => {
    let received;
    const compiled = compileCsharpSource({ surface, targetOptions: { outputType: "Exe" },
      sourceText: "export function main(): void {}",
      compileTarget(request, observer) { received = request; return compileCsharpAnalysisTarget(request, observer); } });
    assert.equal(compiled.artifacts.size, 0);
    assert.deepEqual(compiled.result.diagnostics.map(diagnostic => diagnostic.code), ["TSONIC_UNCALLED_BINARY_ENTRY_MAIN"]);
    // nextgen C-2542 (R-F5-B6, Q33): the refusal is Host-originated (analyses.binaryEntryIssues of the entry file);
    // whether the output is an executable is the target setting, so C# forwards that Host issue unchanged.
    const [diagnostic] = compiled.result.diagnostics;
    const source = received.input.source;
    const entry = source.syntax.getSourceFile(diagnostic.sourceNode);
    const published = source.facts.analyses.binaryEntryIssues(entry).filter(issue => issue.code === diagnostic.code);
    assert.equal(published.length, 1, "one published Host refusal");
    assert.equal(diagnostic.message, published[0].message, "the Host message is forwarded unchanged");
    assert.equal(diagnostic.sourceNode, published[0].node, "the Host site is forwarded unchanged");
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
