import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";

test("absent fulfilled async handlers and void sources retain exact native optional completions", () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
const wide = 9007199254740993n as int64;
const kept = await Promise.resolve<int64>(wide).then(undefined, async () => { await Promise.resolve<void>(undefined); return wide; });
const recovered = await Promise.reject<int64>(new Error("source")).then(undefined, async () => { await Promise.resolve<void>(undefined); return wide; });
const present = await Promise.resolve<number>(0).then(undefined, async () => { await Promise.resolve<void>(undefined); });
const missing = await Promise.reject<number>(new Error("source")).then(undefined, async () => { await Promise.resolve<void>(undefined); });
const voidSource = await Promise.resolve<void>(undefined).then(undefined, () => wide);
const voidRejected = await Promise.reject<void>(new Error("source")).then(undefined, () => wide);
const asyncVoidSource = await Promise.resolve<void>(undefined).then(undefined, async () => { await Promise.resolve<void>(undefined); return wide; });
const asyncVoidRejected = await Promise.reject<void>(new Error("source")).then(undefined, async () => { await Promise.resolve<void>(undefined); return wide; });
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
