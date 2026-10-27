import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`external generic callees retain their decided source refusal on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: `import { foreign } from "./foreign.js";
export function read(): number { return foreign<number>(1); }`,
      files: { "/project/foreign.d.ts": "export declare function foreign<Value>(value: Value): Value;" },
    });
    assert.equal(compiled.sourceDiagnosticsText, "", "the declaration-only source signature is checked");
    assert.equal(compiled.result.diagnostics.some(issue => issue.message ===
      "The exact selected source callee is external to the project and has no C# target relation."), true,
    "the existing callee-owner refusal is not masked by unavailable later parameter evidence");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_METADATA_NOT_PROVEN"), false,
      "a declaration-only source function is not fabricated native provider metadata");
    assert.equal(compiled.result.program === undefined, true, "the rejected source call has no sealed program");
    assert.equal(compiled.result.artifacts.length, 0, "the rejected source call has no generated artifacts");
  });
}
