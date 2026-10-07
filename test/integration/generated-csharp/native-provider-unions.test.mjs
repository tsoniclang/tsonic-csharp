import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { nativeProviderUnionSource } from "../../../../tsonic/test/fixtures/native-provider-unions.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native provider unions retain selected members and nominal payloads", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()], sourceText: nativeProviderUnionSource });
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /InvokeDynamic|ReadDynamicSlot/);
  executeCsharpConstruction(compiled, "native-provider-unions", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
