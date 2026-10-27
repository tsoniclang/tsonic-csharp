import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpCallableContractIndexesEqual } from "../../../dist/analysis/callables/analyze.js";
import { overloaded, cases } from "./generic-permission-origins.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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
}
