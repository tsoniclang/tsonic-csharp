import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { nativeProviderCategoriesSource } from "../../../../tsonic/test/fixtures/native-provider-categories.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native provider categories retain member result identities and one evaluation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()],
    sourceText: nativeProviderCategoriesSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /GetType\(|System\.Reflection/u);
  executeCsharpConstruction(compiled, "native-provider-categories", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
