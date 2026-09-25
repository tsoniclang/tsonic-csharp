import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { providerIndexedNativeTypes, providerIndexedNativeUse } from "../../../../tsonic/test/fixtures/provider-indexed-native-types.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("provider indexed types preserve native fields, aliases and unannotated returns across files", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()],
    sourceText: providerIndexedNativeUse, files: { "model.ts": providerIndexedNativeTypes },
  });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /long size/u);
  assert.match(output, /long direct/u);
  assert.match(output, /long\? optional/u);
  assert.match(output, /long forward\(long size\)/u);
  assert.match(output, /long exact\(long size\)/u);
  assert.match(output, /double plain\(double value\)/u);
  assert.match(output, /long value =/u);
  assert.doesNotMatch(output, /double (?:size|direct)|Convert\.ToDouble/u);
  executeCsharpConstruction(compiled, "provider-indexed-native-types", false, false, [
    join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj"),
  ]);
});
