import test from "node:test";
import { crossFileBranchUnionFiles } from "../../../../tsonic/test/fixtures/cross-file-branch-unions.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`cross-file branch unions preserve exact aliases, native payloads and absence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ files: crossFileBranchUnionFiles,
      sourceText: crossFileBranchUnionFiles["index.ts"], surface }), "cross-file-branch-unions");
  });
}
