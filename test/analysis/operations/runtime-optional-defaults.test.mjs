import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} an always-present tuple retains its exact integer and never evaluates its floating default`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      function next(): number { return 3; }
      export function run(): boolean { const [item = next()] = [1]; return item === 1; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.targetDiagnostics.length, 0, "the original always-present tuple has no native diagnostics");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /long item = [^;]+\.Item1;/u);
    assert.doesNotMatch(output, /long item = [^;]*next\(/u);
  });

  test(`${surface} a runtime-optional integer element rejects its reachable floating default precisely`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      import type { int64 } from "@tsonic/core/types.js";
      function next(): number { return 3; }
      export function run(values: (int64 | undefined)[]): void {
        const [item = next()] = values; void item;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => [code, message]),
      [["CSHARP_UNSUPPORTED_AST", "No exact C# implicit conversion relates 'source:float64' to 'source:int64'. Annotate the value with an integral type."]]);
    assert.equal(compiled.artifacts.size, 0);
  });
}
