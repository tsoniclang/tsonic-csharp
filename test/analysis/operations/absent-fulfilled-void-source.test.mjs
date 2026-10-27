import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";

test("void-source absent fulfillment retains complete synchronous and asynchronous optional witnesses", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
const wide = 9007199254740993n as int64;
const present = await Promise.resolve<void>(undefined).then(undefined, () => wide);
const rejected = await Promise.reject<void>(new Error("source")).then(undefined, () => wide);
const asyncPresent = await Promise.resolve<void>(undefined).then(undefined, async () => wide);
const asyncRejected = await Promise.reject<void>(new Error("source")).then(undefined, async () => wide);
console.log(present === undefined && rejected === wide && asyncPresent === undefined && asyncRejected === wide);
` });
  assert.equal(compiled.result.diagnostics.length, 0, compiled.result.diagnostics.slice(0, 8)
    .map(issue => csharpSourceDiagnosticLabel(compiled.source, issue)).join("\n"));
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes(".ThenOptional<"), true, "the actual native synchronous optional relation is selected");
  assert.equal(generated.includes(".ThenOptionalAsync<"), true, "the actual native asynchronous optional relation is selected");
  assert.equal(generated.includes(".Catch("), false, "absent fulfillment does not allocate a synthetic catch callback");
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-void-source", false, false, [], "");
  assert.equal(output.trim(), "true", "genuine absence and the exact wide int64 survive all four native branches");
});
