import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
let calls = 0;
function readCalls() { return calls; }
function initialize(): number { calls++; return calls; }
function factory(): () => number { calls++; return () => initialize(); }
function fail(): number { calls++; throw new Error("discarded call"); }
class Callbacks {
  get callback(): () => number { calls++; return () => initialize(); }
}
export function run(): boolean {
  calls = 0;
  (() => initialize());
  (((async () => initialize())));
  (function () { return initialize(); });
  if (readCalls() !== 0) return false;
  const captured = initialize();
  (() => captured + initialize());
  async () => captured + initialize();
  void (() => initialize());
  void (async () => initialize());
  if (readCalls() !== 1 || captured !== 1) return false;
  let iterations = 0;
  for (() => initialize(); iterations < 2; () => initialize()) { iterations++; }
  for (async () => initialize(); iterations < 4; async () => initialize()) { iterations++; }
  if (iterations !== 4 || readCalls() !== 1) return false;
  const callback = () => initialize();
  if (callback() !== 2) return false;
  factory();
  new Callbacks().callback;
  if (readCalls() !== 4) return false;
  for (initialize(); iterations < 6; initialize()) { iterations++; }
  if (readCalls() !== 7) return false;
  let caught = false;
  try { fail(); } catch { caught = true; }
  return caught && readCalls() === 8;
}
export function discarded(input: number): number {
  (() => input + 1);
  async () => input + 1;
  void (() => input + 1);
  let mutable = input;
  (() => mutable++);
  async () => mutable++;
  void (() => mutable++);
  return mutable;
}
`;

for (const surface of [undefined, "js"]) {
  test(`discarded definitions preserve captured initialization, invoked effects and zero native allocation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `discarded-lambda-definitions-${surface ?? "native"}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("discarded definition effects");
double total = 0;
for (int index = 0; index < 1000; index++) total += Tsonic.Generated.Index.discarded(index);
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) total += Tsonic.Generated.Index.discarded(index);
long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (total != 50494500 || allocated != 0) throw new System.Exception("uninvoked definitions must not allocate");
`);
  });

  test(`discarded definitions still require valid source body checking (${surface ?? "native"})`, () => {
    const checked = checkCsharpSource({ surface, sourceText: `export function run(): boolean { (() => missingIdentifier); return true; }` });
    assert.equal(/Cannot find name.*missingIdentifier/u.test(checked.sourceDiagnosticsText), true, "discard does not suppress source errors");
  });

  test(`an absence default retains and invokes its required lambda (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let calls = 0;
      function initialize() { calls++; return calls; }
      export function run(): boolean {
        const { callback = () => initialize() } = { callback: undefined };
        return calls === 0 && callback() === 1 && callback() === 2;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `retained-default-lambda-${surface ?? "native"}`);
  });
}
