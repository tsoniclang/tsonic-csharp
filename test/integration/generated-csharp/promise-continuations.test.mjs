import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("Promise executors and continuations preserve native completion, values and rejection", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
async function fail(): Promise<number> { throw new Error("failure"); }
async function next(value: number): Promise<number> { return value + 1; }
export async function run(): Promise<boolean> {
  const wide: uint64 = 9007199254740993n;
  const value = await Promise.resolve(wide).then(value => value);
  const recovered = await fail().catch(reason => 7);
  const adopted = await Promise.resolve(2).then(value => next(value));
  const delayed = new Promise<number>((resolve, reject) => { resolve(4); reject(new Error("late")); });
  const fromExecutor = await delayed.then(value => value + 1);
  const done = new Promise<void>((resolve, reject) => {
    void Promise.resolve(5).then(value => { if (value === 5) resolve(); }, reason => reject(reason));
  });
  await done;
  return value === wide && recovered === 7 && adopted === 3 && fromExecutor === 5;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "promise-continuations", true);
});

test("Promise rejection preserves a source error's identity and native payload", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
class Failure extends Error {
  readonly code: uint64;
  constructor(code: uint64) { super("failure"); this.code = code; }
}
export async function run(): Promise<boolean> {
  const wide: uint64 = 9007199254740993n;
  const original = new Failure(wide);
  const rejected = new Promise<void>((resolve, reject) => { reject(original); });
  try { await rejected; return false; }
  catch (reason) {
    if (!(reason instanceof Failure)) return false;
    return reason === original && reason.code === wide;
  }
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "promise-rejection-identity", true);
});
