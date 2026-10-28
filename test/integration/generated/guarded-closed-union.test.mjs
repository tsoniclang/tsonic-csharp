import test from "node:test";
import assert from "node:assert/strict";
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

test("an unguarded native Buffer is not admitted to closed JSON serialization", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
import { Buffer } from "node:buffer";
export function encode(value: Buffer): string { return JSON.stringify(value) ?? "absent"; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original native Buffer source is checked");
  assert.equal(compiled.targetDiagnostics.length > 0 && compiled.targetDiagnostics.every(issue =>
    issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message === "Target type 'target:Tsonic.CSharp.Node.Buffer<>' has no closed JSON serialization policy."), true,
  "absence of an actual guard retains the exact unsupported native payload refusal");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "unsupported native payloads publish neither a program nor artifacts");
});
