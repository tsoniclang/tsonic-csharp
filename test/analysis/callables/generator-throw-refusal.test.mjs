import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  for (const asynchronous of [false, true]) {
    test(`checked ${asynchronous ? "async " : ""}generator throw-in is refused before publication on ${surface}`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        ${asynchronous ? "async " : ""}function* values(): ${asynchronous ? "AsyncGenerator" : "Generator"}<number, void, unknown> { yield 1; }
        export ${asynchronous ? "async " : ""}function run(): ${asynchronous ? "Promise<void>" : "void"} {
          ${asynchronous ? "await " : ""}values().throw(undefined);
        }
      ` });
      assert.equal(compiled.sourceDiagnosticsText, "", "the supplied canonical absence is valid checked source");
      const refusals = compiled.result.diagnostics.filter(issue => issue.code === "TSONIC_GENERATOR_THROW_UNSUPPORTED");
      assert.equal(refusals.length, 1, "the exact selected generator member has one shared refusal owner");
      assert.equal(refusals[0].message, "Generator throw-in is not supported.", "the profile owns the precise unsupported capability");
      assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
        "the refusal precedes sealing and native planning");
      assert.equal(compiled.artifacts.size, 0, "unsupported throw-in publishes no output");
    });
  }
  test(`an unrelated class method named throw remains admitted on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Box { throw(value: number): number { return value + 1; } }
      export function run(): number { return new Box().throw(4); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "TSONIC_GENERATOR_THROW_UNSUPPORTED"), false,
      "a source spelling is not a checked builtin generator identity");
    assert.equal(compiled.artifacts.size > 0, true, "the ordinary native method still emits");
  });
}
