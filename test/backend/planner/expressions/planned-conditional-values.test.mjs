import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

const sourceText = `
import type { uint64, int32 } from "@tsonic/core/types.js";
class Counter {
  calls: int32 = 0;
  observe(): int32 { return this.calls; }
  wide(): uint64 { this.calls++; return 9007199254740993n; }
  empty(): void { this.calls++; }
  fail(): never { this.calls++; throw new Error("selected failure"); }
}
function and(enabled: boolean, counter: Counter): boolean | uint64 { return enabled && counter.wide(); }
function or(enabled: boolean, counter: Counter): boolean | uint64 { return enabled || counter.wide(); }
function empty(enabled: boolean, counter: Counter): boolean | void { return enabled && counter.empty(); }
function stop(enabled: boolean, counter: Counter): boolean { return enabled || counter.fail(); }
function identical(enabled: boolean, counter: Counter): boolean | Counter { return enabled && counter; }
function present(enabled: boolean, value: uint64 | undefined): boolean | uint64 | undefined { return enabled && value; }
function constant(counter: Counter): uint64 { return true && counter.wide(); }
function sequenced(counter: Counter): uint64 { return (counter.empty(), true) && counter.wide(); }
function both(left: boolean, right: boolean): boolean { return left && right; }
function either(left: boolean, right: boolean): boolean { return left || right; }
function lazy(enabled: boolean, counter: Counter): boolean { return enabled && (counter.empty(), true); }
export function run(): boolean {
  const counter = new Counter();
  if (both(true, false) || !either(false, true) || lazy(false, counter) || counter.observe() !== 0) return false;
  if (and(false, counter) !== false || or(true, counter) !== true || counter.observe() !== 0) return false;
  if (and(true, counter) !== 9007199254740993n || or(false, counter) !== 9007199254740993n) return false;
  if (empty(false, counter) !== false || empty(true, counter) !== null || counter.observe() !== 3) return false;
  if (identical(true, counter) !== counter || identical(false, counter) !== false) return false;
  if (present(true, undefined) !== null || present(false, undefined) !== false) return false;
  if (constant(counter) !== 9007199254740993n || !stop(true, counter)) return false;
  if (sequenced(counter) !== 9007199254740993n) return false;
  let rejected = false;
  try { stop(false, counter); } catch { rejected = true; }
  return rejected && counter.observe() === 7;
}
`;

for (const surface of [undefined, "js"]) {
  test(`plan-only boolean short-circuit values retain exact native carriers on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /Union<bool, ulong>/u);
    assert.match(emitted, /return left && right;/u);
    assert.match(emitted, /return left \|\| right;/u);
    assert.doesNotMatch(emitted, /u64_to_f64|Task\.Run|ContinueWith|DynamicInvoke|System\.Reflection/u);
  });
  test(`native boolean short-circuit values retain laziness, width, identity and absence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `planned-conditional-values-${surface ?? "native"}`);
  });
}
