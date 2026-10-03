import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeGuardReachabilitySource, nativeHeaderReachabilitySource } from "../../../../tsonic/test/fixtures/native-guard-reachability.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { join } from "node:path";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";

for (const surface of [undefined, "js"]) {
  test(`native guard reachability preserves absence and effects on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeGuardReachabilitySource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-guard-reachability");
  });
}

test("exact native header provider omits the impossible number and array paths", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeHeaderReachabilitySource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "native-header-reachability", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
