import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpCallableContractIndexesEqual } from "../../../dist/analysis/callables/analyze.js";
import { overloaded, cases } from "./generic-permission-origins.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, declarations, expression] of Array.from(cases).slice(0, 8)) {
test(`${surface} native generic permission origin preserves ${name}`, { timeout: 240_000 }, () => {
      const compiled = compileCsharpSource({ surface,
        sourceText: `${declarations}\nexport function run(): boolean { return ${expression}; }` });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.result.program !== undefined, true, `${name}: the actual native program is published`);
      executeCsharpConstruction(compiled, `generic-permission-${surface}-${name}`);
    });
}

test(`${surface} an imported source overload retains its originating checked declaration`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: `import { pass as choose } from "./source.js";
        export function run(): boolean { return choose<number>(7) === 7; }`,
      files: { "source.ts": `export ${overloaded.replace("\nfunction", "\nexport function")}` } });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `generic-permission-${surface}-import`);
  });

for (const explicit of Array.from([false, true]).slice(0, 2)) {
test(`${surface} overloaded source permission remains native false (${explicit ? "explicit" : "inferred"})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { int32 } from "@tsonic/core/types.js";
        import { Span } from "@tsonic/dotnet/System.js";
        ${overloaded}
        export function fail(value: Span<int32>): int32 {
          return pass${explicit ? "<Span<int32>>" : ""}(value).Length;
        }` });
      assert.equal(compiled.sourceDiagnosticsText, "", "the actual source generic instantiation is checked");
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_GENERIC_ARGUMENT"), true,
        `the proved ordinary source slot retains its actual native no-ref-struct permission: ${compiled.result.diagnostics
          .slice(0, 4).map(issue => `${issue.code}: ${issue.message.slice(0, 1024)}`).join(" | ")}`);
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_METADATA_NOT_PROVEN"), false,
        "an exact checked project overload no longer lacks its producer contract");
      assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
        "the invalid native instantiation is refused before publication");
    });
}
}
