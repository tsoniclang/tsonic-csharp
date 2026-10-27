import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";
import { cases } from "./promise-result-retention.fixtures.mjs";

test("C# native discarded results retain both actual eager call sites without observation", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
let executions = 0;
async function leaf(): Promise<number> { executions += 1; return 1; }
export function reject(): void { leaf(); leaf(); }
export function starts(): number { return executions; }
` });
  const issues = compiled.result.diagnostics;
  assert.equal(compiled.sourceDiagnosticsText, "", "both original native calls remain checked source");
  assert.equal(issues.length, 0, "both independent eager Task calls are admitted under native semantics");
  assert.equal(compiled.result.program !== undefined, true, "the admitted native program is published");
  const results = csharpProgramPromiseResults(compiled.result.program);
  assert.equal(results.filter(row => row.disposition.kind === "discarded").length, 2,
    "both actual source demands survive the same admission window");
  assert.equal(results.every(row => row.discard === undefined), true, "neither native drop is relabelled rejection observation");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal((generated.match(/_ = global::Tsonic\.Generated\.Index\.leaf\(\);/gu) ?? []).length, 2,
    "each actual native call is emitted exactly once");
  assert.doesNotMatch(generated, /ObserveDiscarded|Task\.Run|Wait\(|\.Result\b/u);
  executeCsharpConstruction(compiled, "two-native-eager-task-drops", false, false, [],
    "Tsonic.Generated.Index.reject(); if (Tsonic.Generated.Index.starts() != 2) throw new System.Exception(\"native eager calls\");");
});
