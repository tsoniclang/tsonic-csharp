import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} integral native slots retain the precise float64 refusal and generic annotation hint`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      function take(input: int32): void { void input; }
      export function run(value: number): void { take(value); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => [code, message]),
      [["CSHARP_UNSUPPORTED_AST", "No exact C# implicit conversion relates 'source:float64' to 'source:int32'. Annotate the value with an integral type."]]);
    assert.equal(compiled.artifacts.size, 0);
  });
}
