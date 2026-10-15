import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, checkCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native Task construction preserves precise values, adoption and errors in ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
class Failure extends Error {}
async function value(): Promise<uint64> { return 9007199254740993n; }
export async function run(): Promise<boolean> {
  const wide: uint64 = 9007199254740993n;
  const original = new Failure("original");
  let executions = 0;
  const immediate = new Promise<uint64>((resolve, reject) => {
    executions++;
    resolve(wide);
    reject(original);
    throw original;
  });
  const adopted = new Promise<uint64>((resolve, reject) => {
    resolve(value());
    reject(original);
    throw original;
  });
  await new Promise<void>(resolve => resolve());
  let nativeIdentity = false;
  try { await new Promise<void>((resolve, reject) => reject(original)); }
  catch (reason) { nativeIdentity = reason instanceof Failure && reason === original; }
  let closedReason = false;
  try { await new Promise<void>((resolve, reject) => reject("closed reason")); }
  catch (reason) { closedReason = reason === "closed reason"; }
  return executions === 1 && await immediate === wide && await adopted === wide && nativeIdentity && closedReason;
}
` });
      assertCsharpCompilationSucceeded(compiled);
      const output = [...compiled.artifacts.values()].join("\n");
      assert.match(output, /Tsonic\.CSharp\.Runtime\.TaskCompletion<ulong>\.Create/u);
      assert.match(output, /Tsonic\.CSharp\.Runtime\.TaskCompletion\.Create/u);
      assert.match(output, /Tsonic\.CSharp\.Runtime\.TaskResolve<ulong>/u);
      assert.match(output, /Tsonic\.CSharp\.Runtime\.TaskReject/u);
      assert.doesNotMatch(output, /PromiseRuntime(?:<[^>]+>)?\.Create|\.PromiseExecutor|\.PromiseResolve|\.PromiseReject/u);
      assert.doesNotMatch(output, /Task<double>|Task<[^>]*BigInteger/u);
      if (surface === undefined) assert.doesNotMatch(output, /Tsonic\.CSharp\.Js/u);
      executeCsharpConstruction(compiled, `source-promise-construction-${surface ?? "native"}`, true);
    });

  test(`native Task construction rejects invalid checked executor values in ${surface ?? "native"}`, () => {
    for (const sourceText of [
      `new Promise<string>(resolve => resolve(17));`,
      `new Promise<string>();`,
      `new Promise<string>(resolve => resolve(undefined));`,
    ]) {
      const checked = checkCsharpSource({ surface, sourceText });
      assert.equal(checked.sourceDiagnosticsText.length > 0, true, sourceText);
    }
  });
}
