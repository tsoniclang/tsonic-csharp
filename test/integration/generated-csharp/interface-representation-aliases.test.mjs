import test from "node:test";
import { interfaceRepresentationAliasFiles, interfaceRepresentationAliasJsProofSource, interfaceRepresentationAliasSource } from "../../../../tsonic/test/fixtures/interface-representation-aliases.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
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
