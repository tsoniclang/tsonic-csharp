import assert from "node:assert/strict";
import test from "node:test";
import { interfaceRepresentationAliasFiles, interfaceRepresentationAliasFilesForEmpty, interfaceRepresentationAliasJsProofSource, interfaceRepresentationAliasJsProofSourceForEmpty, interfaceRepresentationAliasSource, interfaceRepresentationAliasSourceForEmpty } from "../../../../tsonic/test/fixtures/interface-representation-aliases.mjs";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function assertOpaqueEmptyRefusals(compiled, sourceText, names) {
  assertCsharpCheckingSucceeded(compiled);
  const issues = compiled.targetDiagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(issues.length, names.length, "only the original opaque empty producers are refused");
  for (const name of names) {
    const start = sourceText.indexOf("{}", sourceText.indexOf(`const ${name}`));
    const issue = issues.find(issue => {
      const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
      return range?.kind === "authored" && range.start === start && range.end === start + 2;
    });
    assert.equal(issue !== undefined, true, `${name}: the original initializer owns its opaque escape`);
    assert.equal(issue?.code, "TSONIC_UNTYPED_OBJECT_LITERAL");
    assert.equal(issue?.message, `This object literal has no target type. Declare a type for '${name}' at this initializer.`);
  }
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "opaque empty producers publish no program, plan or artifacts");
}

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
    const sourceText = `${interfaceRepresentationAliasSource}
${surface === "js" ? interfaceRepresentationAliasJsProofSource : ""}`;
    const original = compileCsharpSource({ surface, sourceText });
    assertOpaqueEmptyRefusals(original, sourceText, surface === "js" ? ["token", "replacement"] : ["token"]);
    const compiled = compileCsharpSource({ surface, sourceText: `${interfaceRepresentationAliasSourceForEmpty(": object")}
${surface === "js" ? interfaceRepresentationAliasJsProofSourceForEmpty(": object") : ""}` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "interface-representation-aliases", false, false, [], surface === "js"
      ? 'if (!Tsonic.Generated.Index.run() || !Tsonic.Generated.Index.runJsAliases()) throw new System.Exception("array facade live and frozen alias");' : undefined);
  });

  test(`cross-file generic array facades retain exact nested backing in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const original = compileCsharpSource({ surface, sourceText: interfaceRepresentationAliasFiles["index.ts"],
      files: { "facades.ts": interfaceRepresentationAliasFiles["facades.ts"] } });
    assertOpaqueEmptyRefusals(original, interfaceRepresentationAliasFiles["index.ts"], ["token", "replacement"]);
    const files = interfaceRepresentationAliasFilesForEmpty(": object");
    const compiled = compileCsharpSource({ surface, sourceText: files["index.ts"], files: { "facades.ts": files["facades.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "cross-file-interface-facades");
  });
}
