import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

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
    .map(issue => `${issue.code}: ${issue.message}; ${issue.sourceNode === undefined ? "no source node" :
      compiled.source.ast.text(issue.sourceNode).slice(0, 1024)}`).join("\n"));
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes(".ThenIdentity("), true, "missing fulfilled callbacks select native identity passthrough");
  assert.equal(generated.includes(".ThenOptional<"), true, "a void rejection callback uses existing genuine optional storage");
  assert.equal(generated.includes(".Catch("), false, "the missing fulfilled callback is not repaired with synthetic catch");
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-promise", false, false, [], "");
  assert.equal(output.trim(), "true", "exact int64, present zero, genuine absence and fulfillment survive the native loop");
});

test("an absent fulfilled handler keeps generic rejection delivery under the actual Promise resolver owner", () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
function wrap<Value>(value: Value): Promise<Value> {
  return new Promise<Value>(resolve => {
    void Promise.reject<number>(new Error("seed")).then(undefined, () => { resolve(value); });
  });
}
console.log(await wrap(7));
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-resolver", false, false, [], "");
  assert.equal(output.trim(), "7", "the actual retained ordinary-matrix resolver body runs and preserves its payload");
});

test("absent fulfilled async handlers and void sources retain exact native optional completions", () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
const wide = 9007199254740993n as int64;
const kept = await Promise.resolve<int64>(wide).then(undefined, async () => { await Promise.resolve(); return wide; });
const recovered = await Promise.reject<int64>(new Error("source")).then(undefined, async () => { await Promise.resolve(); return wide; });
const present = await Promise.resolve<number>(0).then(undefined, async () => { await Promise.resolve(); });
const missing = await Promise.reject<number>(new Error("source")).then(undefined, async () => { await Promise.resolve(); });
const voidSource = await Promise.resolve().then(undefined, () => wide);
const voidRejected = await Promise.reject<void>(new Error("source")).then(undefined, () => wide);
const asyncVoidSource = await Promise.resolve().then(undefined, async () => { await Promise.resolve(); return wide; });
const asyncVoidRejected = await Promise.reject<void>(new Error("source")).then(undefined, async () => { await Promise.resolve(); return wide; });
console.log(kept === wide && recovered === wide && present === 0 && missing === undefined &&
  voidSource === undefined && voidRejected === wide && asyncVoidSource === undefined && asyncVoidRejected === wide);
` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes(".ThenIdentityAsync("), true, "async rejection preserves the actual fulfilled int64 carrier");
  assert.equal(generated.includes(".ThenOptionalAsync<"), true, "async void completion uses the same existing optional-storage owner");
  assert.equal(generated.includes(".Catch("), false, "async absence does not introduce a synthetic catch route");
  const output = executeCsharpConstruction(compiled, "absent-fulfilled-async-promise", false, false, [], "");
  assert.equal(output.trim(), "true", "all eight actual native async and void-source completion branches retain their values");
});
