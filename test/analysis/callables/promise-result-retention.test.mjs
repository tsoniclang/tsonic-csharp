import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";

const cases = [
  ["owned-capture", `
async function keep(value: number, pending: Promise<void>): Promise<number> {
  const read = () => value;
  await pending;
  return read();
}
export async function run(): Promise<boolean> {
  const stored = keep(7, Promise.resolve(undefined));
  return await stored === 7;
}`],
  ["forward-native-callback", `
export function forward<Value>(callback: () => Promise<Value>): Promise<Value> { return callback(); }
export async function invoke<Value>(callback: () => Promise<Value>): Promise<Value> {
  return await forward(callback);
}
async function read(): Promise<number> { return 7; }
export async function run(): Promise<boolean> { return await invoke(read) === 7; }
`],
  ["optional-native-callback", `
function fail(): never { throw new Error("absent"); }
async function read(): Promise<number> { return 7; }
export async function call(callback: (() => Promise<number>) | undefined): Promise<number> {
  return await (callback ?? fail())();
}
export async function run(): Promise<boolean> {
  if (await call(read) !== 7) return false;
  try { await call(undefined); return false; } catch { return true; }
}`],
  ["generic-stored-completion", `
export async function source<Value>(callback: () => Promise<Value>): Promise<Value> { return await callback(); }
export function retain<Other>(callback: () => Promise<Other>): Promise<Other> { return source(callback); }
export async function consumer<Actual>(callback: () => Promise<Actual>): Promise<Actual> {
  return await retain(callback);
}
async function read(): Promise<number> { return 7; }
export async function run(): Promise<boolean> { return await consumer(read) === 7; }
`],
  ["recursive-owned-completion", `
async function left(value: number, count: number, pending: Promise<void>): Promise<number> {
  if (count > 0) return await right(value, count - 1, pending);
  await pending; return value;
}
async function right(value: number, count: number, pending: Promise<void>): Promise<number> {
  if (count > 0) return await left(value, count - 1, pending);
  await pending; return value;
}
export async function run(): Promise<boolean> {
  const stored = left(7, 3, Promise.resolve(undefined));
  return await stored === 7;
}`],
  ["class-native-completion", `
class Work {
  completion: Promise<void> = Promise.resolve(undefined);
  async wait(): Promise<void> { await this.completion; }
}
export async function run(): Promise<boolean> { const work = new Work(); await work.wait(); return true; }
`],
  ["exact-int64-native-callback", `
import type { int64 } from "@tsonic/core/types.js";
async function read(value: int64): Promise<int64> { return value; }
export async function invoke(callback: (value: int64) => Promise<int64>, value: int64): Promise<int64> {
  return await callback(value);
}
export async function run(): Promise<boolean> {
  const value: int64 = 9007199254740993n;
  const stored = invoke(read, value);
  return await stored === value;
}`],
];

for (const [name, source] of cases) {
  test(`C# native Task retention preserves ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: source });
    assert.equal(compiled.targetDiagnostics.length, 0,
      JSON.stringify(compiled.targetDiagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(compiled.result.program !== undefined, true, "native-admitted Task/delegate values remain publishable");
    assert.equal(csharpProgramPromiseResults(compiled.result.program).length > 0, true, "one result-use owner publishes the decisions");
    executeCsharpConstruction(compiled, `promise-retention-${name}`, true, false, [],
      "Tsonic.CSharp.Js.JsEventLoop.Run(async () => { if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"native Task retention\"); });");
  });
}

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
