import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";
import { cases } from "./promise-result-retention.fixtures.mjs";

for (const [name, source] of Array.from(cases).slice(0, 8)) {
test(`C# native Task retention preserves ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: source });
    assert.equal(compiled.targetDiagnostics.length, 0,
      JSON.stringify(compiled.targetDiagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(compiled.result.program !== undefined, true, "native-admitted Task/delegate values remain publishable");
    assert.equal(csharpProgramPromiseResults(compiled.result.program).length > 0, true, "one result-use owner publishes the decisions");
    executeCsharpConstruction(compiled, `promise-retention-${name}`, true, false, [],
      "Tsonic.CSharp.Js.JsEventLoop.Run(async () => { if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"native Task retention\"); });");
  });
}
