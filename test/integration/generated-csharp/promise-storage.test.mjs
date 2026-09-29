import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("annotated Promise storage preserves values, repeated awaits and rejection", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
class Work {
  completion: Promise<void> = Promise.resolve(undefined);
  value: Promise<string> = Promise.resolve("ready");
  wide: Promise<uint64> = Promise.resolve(wideValue());
  async wait(): Promise<void> { await this.completion; }
  pending(): Promise<void> { return this.completion; }
  fail(): void { this.completion = failure(); }
}
async function failure(): Promise<void> { throw new Error("failed"); }
function wideValue(): uint64 { return 9007199254740993n; }
function retain(value: Promise<void>): void { void value; }
function forward(value: Promise<void>): Promise<void> { return value; }
function create(): Promise<void> { return forward(Promise.resolve(undefined)); }
async function receive(value: Promise<void>): Promise<void> { await value; }
export async function run(): Promise<boolean> {
  await Promise.resolve(undefined);
  if (await Promise.resolve("standalone") !== "standalone") return false;
  if (await Promise.resolve(wideValue()) !== wideValue()) return false;
  const completion: Promise<void> = Promise.resolve(undefined);
  retain(completion);
  await receive(forward(completion));
  await create();
  await completion;
  await completion;
  let text: Promise<string> = Promise.resolve("initial");
  if (await text !== "initial") return false;
  text = Promise.resolve("replaced");
  if (await text !== "replaced" || await text !== "replaced") return false;
  const work = new Work();
  await work.wait();
  await work.pending();
  const expected: uint64 = 9007199254740993n;
  if (await work.value !== "ready" || await work.wide !== expected) return false;
  work.fail();
  let failures = 0;
  try { await work.wait(); } catch { failures += 1; }
  try { await work.pending(); } catch { failures += 1; }
  return failures === 2;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.result.artifacts.filter(artifact => artifact.path.endsWith(".cs")).map(artifact => artifact.text).join("\n");
  assert.doesNotMatch(output, /ContinueWith|PromiseRuntime\.Then|PromiseRuntime\.ThenAsync/);
  executeCsharpConstruction(compiled, "promise-storage", true);
});
