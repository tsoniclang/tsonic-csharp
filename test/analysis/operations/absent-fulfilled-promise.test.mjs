import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";

test("an absent fulfilled Promise handler preserves native identity and exact optional rejection correspondence", () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
const wide = 9007199254740993n as int64;
const kept = await Promise.resolve<int64>(wide).then(undefined, () => wide);
const present = await Promise.resolve<number>(0).then(undefined, () => {});
const missing = await Promise.reject<number>(new Error("source")).then(undefined, () => {});
const recovered = await Promise.reject<int64>(new Error("source")).then(undefined, () => wide);
const unchanged = await Promise.resolve<int64>(wide).then();
console.log(kept === wide && present === 0 && missing === undefined && recovered === wide && unchanged === wide);
` });
  assert.equal(compiled.result.diagnostics.length, 0, compiled.result.diagnostics.slice(0, 8)
    .map(issue => csharpSourceDiagnosticLabel(compiled.source, issue)).join("\n"));
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes(".ThenIdentity("), true, "missing fulfilled callbacks select native identity passthrough");
  assert.equal(generated.includes(".ThenOptional<"), true, "a void rejection callback uses existing genuine optional storage");
  assert.equal(generated.includes(".Catch("), false, "the missing fulfilled callback is not repaired with synthetic catch");
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-promise", false, false, [], "");
  assert.equal(output.trim(), "true", "exact int64, present zero, genuine absence and fulfillment survive the native loop");
});
