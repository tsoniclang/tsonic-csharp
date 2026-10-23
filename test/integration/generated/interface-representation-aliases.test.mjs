import assert from "node:assert/strict";
import test from "node:test";
import { interfaceRepresentationAliasFiles, interfaceRepresentationAliasJsProofSource, interfaceRepresentationAliasSource } from "../../../../tsonic/test/fixtures/interface-representation-aliases.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`an array facade with an authored member retains its native contract in ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export interface Branded extends ReadonlyArray<number> { readonly brand: string; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the branded array interface is checked source");
    assert.equal(compiled.targetDiagnostics.length === 1 &&
      compiled.targetDiagnostics[0].code === "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED", true,
    "an additional authored member cannot erase the native interface contract into an array");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "an invalid native interface publishes no program, plan or artifact");
  });

  test(`empty interface facades retain their native array contract in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `${interfaceRepresentationAliasSource}
${surface === "js" ? interfaceRepresentationAliasJsProofSource : ""}` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "interface-representation-aliases", false, false, [], surface === "js"
      ? 'if (!Tsonic.Generated.Index.run() || !Tsonic.Generated.Index.runJsAliases()) throw new System.Exception("array facade live and frozen alias");' : undefined);
  });

  test(`cross-file generic array facades retain exact nested backing in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: interfaceRepresentationAliasFiles["index.ts"],
      files: { "facades.ts": interfaceRepresentationAliasFiles["facades.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "cross-file-interface-facades");
  });
}
