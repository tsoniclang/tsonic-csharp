import test from "node:test";
import { join } from "node:path";
import { guardedClosedUnionFiles } from "../../../../tsonic/test/fixtures/guarded-closed-union.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native guards retain every surviving cross-file union arm before explicit JSON conversion", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    surface: "js",
    capabilities: [nodejsCapability()],
    sourceText: guardedClosedUnionFiles["index.ts"],
    files: { "contracts.ts": guardedClosedUnionFiles["contracts.ts"] },
  });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "guarded-closed-union", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
