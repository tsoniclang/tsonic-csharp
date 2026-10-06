import test from "node:test";
import { join } from "node:path";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { optionalProviderErrorFieldSource } from "../../../../tsonic/test/fixtures/optional-provider-error-fields.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("optional provider Error fields retain canonical storage through aliases and schema reads",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()],
      sourceText: optionalProviderErrorFieldSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "optional-provider-error-fields", false, false,
      [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
  });
